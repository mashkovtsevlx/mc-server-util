import net from "net";

/**
 * Get the status of a Minecraft Java Edition server
 * @param {string} host - The hostname or IP address of the server
 * @param {number} port - The port number (default: 25565)
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<Object>} Server status data
 */
export const getMinecraftServerStatus = (host, port = 25565, debug = false) => {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let data = Buffer.alloc(0);
    let hasReceivedResponse = false;
    
    // Set a timeout for the connection
    socket.setTimeout(10000); // Increase timeout to 10 seconds
    
    socket.on('timeout', () => {
      if (debug) console.log('Connection timed out');
      socket.destroy();
      reject(new Error('Connection timeout'));
    });
    
    socket.on('error', (err) => {
      if (debug) console.log('Socket error:', err.message);
      reject(err);
    });
    
    socket.connect(port, host, () => {
      if (debug) console.log('Connected to server, sending handshake');
      
      try {
        // Minecraft server protocol step 1: Send handshake packet
        const handshakePacket = createHandshakePacket(host, port, debug);
        if (debug) console.log('Handshake packet:', handshakePacket.toString('hex'));
        socket.write(handshakePacket);
        
        // Minecraft server protocol step 2: Send status request packet
        const statusRequestPacket = createStatusRequestPacket(debug);
        if (debug) console.log('Status request packet:', statusRequestPacket.toString('hex'));
        socket.write(statusRequestPacket);
      } catch (err) {
        if (debug) console.log('Error preparing packets:', err.message);
        socket.destroy();
        reject(err);
      }
    });
    
    socket.on('data', (chunk) => {
      if (debug) console.log('Received data chunk:', chunk.toString('hex'));
      data = Buffer.concat([data, chunk]);
      
      try {
        // Try to parse the data
        const result = parseStatusResponse(data, debug);
        hasReceivedResponse = true;
        if (debug) console.log('Successfully parsed response');
        socket.end();
        result.online = true;
        if (result?.players?.online && result.players.online > 0) {
            result.players.nicknames = result.players.sample.map(player => player.name).join(", ");
        }
        resolve(result);
      } catch (e) {
        if (e.message === 'Incomplete data') {
          if (debug) console.log('Received incomplete data, waiting for more...');
          // If the data is incomplete, wait for more data
        } else {
          if (debug) console.log('Error parsing response:', e.message);
          socket.end();
          reject(e);
        }
      }
    });
    
    socket.on('end', () => {
      if (!hasReceivedResponse) {
        if (debug) {
          console.log('Connection closed without valid response');
          if (data.length > 0) {
            console.log('Partial data received:', data.toString('hex'));
          }
        }
        reject(new Error('Connection closed without valid response'));
      }
    });
    
    socket.on('close', () => {
      if (debug) console.log('Socket closed');
      if (!hasReceivedResponse) {
        reject(new Error('Connection closed without valid response'));
      }
    });
  });
}

/**
 * Send an RCON command to a Minecraft server
 * @param {string} host - The hostname or IP address of the server
 * @param {number} port - The RCON port (default: 25575)
 * @param {string} password - RCON password
 * @param {string} command - The command to execute
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<string>} Command response
 */
export const sendRconCommand = (host, port = 25575, password, command, debug = false) => {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let authenticated = false;
    let responseData = '';
    
    // Set a timeout for the connection
    socket.setTimeout(5000);
    
    socket.on('timeout', () => {
      if (debug) console.log('RCON connection timeout');
      socket.destroy();
      reject(new Error('RCON connection timeout'));
    });
    
    socket.on('error', (err) => {
      if (debug) console.log('RCON socket error:', err.message);
      reject(err);
    });
    
    socket.connect(port, host, () => {
      if (debug) console.log('Connected to RCON, sending authentication');
      
      // Authenticate first
      const authPacket = createRconPacket(0x03, 0x123, password);
      socket.write(authPacket);
    });
    
    socket.on('data', (data) => {
      if (debug) console.log('Received RCON data:', data.length, 'bytes');
      
      try {
        const packetInfo = parseRconPacket(data, debug);
        
        if (!authenticated) {
          if (packetInfo.id === 0x123) {
            if (packetInfo.id !== -1) {
              if (debug) console.log('RCON authentication successful');
              authenticated = true;
              
              // Now send the command
              const commandPacket = createRconPacket(0x02, 0x456, command);
              socket.write(commandPacket);
            } else {
              socket.destroy();
              reject(new Error('RCON authentication failed - incorrect password'));
            }
          }
        } else {
          // We're authenticated and this is a command response
          if (packetInfo.id === 0x456) {
            if (debug) console.log('Received command response');
            responseData += packetInfo.payload;
            
            // Some servers might split responses into multiple packets
            // For simplicity, we'll assume a single packet response
            socket.end();
            resolve(responseData);
          }
        }
      } catch (err) {
        if (debug) console.log('Error parsing RCON packet:', err.message);
        socket.destroy();
        reject(err);
      }
    });
    
    socket.on('end', () => {
      if (debug) console.log('RCON connection ended');
      if (!authenticated) {
        reject(new Error('RCON connection closed before authentication'));
      } else if (responseData === '') {
        reject(new Error('RCON connection closed before receiving response'));
      }
    });
    
    socket.on('close', () => {
      if (debug) console.log('RCON socket closed');
    });
  });
}

/**
 * Send a 'say' command via RCON
 * @param {string} host - The hostname or IP address of the server
 * @param {string} password - RCON password
 * @param {string} message - The message to broadcast
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<string>} Command response
 */
export const sendRconSayCommand = (host, password, message, debug = false) => {
  return sendRconCommand(host, 25575, password, `say ${message}`, debug);
}

/**
 * Create a handshake packet
 * @param {string} host - Server hostname
 * @param {number} port - Server port
 * @param {boolean} debug - Enable debug logging
 * @returns {Buffer} Handshake packet
 */
function createHandshakePacket(host, port, debug = false) {
  // Protocol version -1 (negative one) means status request regardless of version
  // This makes the code more compatible across different server versions
  const protocolVersion = -1;
  
  if (debug) console.log(`Creating handshake packet with protocol version ${protocolVersion}`);
  
  // Protocol structure:
  // <packet length> <packet id> <protocol version> <host length> <host> <port> <next state>
  
  // Create the payload parts
  const protocolVersionBuffer = varintEncode(protocolVersion);
  const hostLengthBuffer = varintEncode(host.length);
  const hostBuffer = Buffer.from(host, 'utf8');
  const portBuffer = Buffer.from([(port >> 8) & 0xFF, port & 0xFF]);
  const nextStateBuffer = varintEncode(1); // 1 for status query
  
  // Combine payload parts
  const payloadParts = [
    protocolVersionBuffer,
    hostLengthBuffer,
    hostBuffer,
    portBuffer,
    nextStateBuffer
  ];
  
  // Create packet with ID 0x00 for handshake
  const packetId = Buffer.from([0x00]);
  const packetBody = Buffer.concat([packetId, ...payloadParts]);
  
  // Prepend the packet length
  const packetLengthBuffer = varintEncode(packetBody.length);
  const fullPacket = Buffer.concat([packetLengthBuffer, packetBody]);
  
  if (debug) {
    console.log('Protocol version buffer:', protocolVersionBuffer.toString('hex'));
    console.log('Host length buffer:', hostLengthBuffer.toString('hex'));
    console.log('Host buffer:', hostBuffer.toString('hex'));
    console.log('Port buffer:', portBuffer.toString('hex'));
    console.log('Next state buffer:', nextStateBuffer.toString('hex'));
    console.log('Packet body length:', packetBody.length);
    console.log('Full packet length:', fullPacket.length);
  }
  
  return fullPacket;
}

/**
 * Create a status request packet
 * @param {boolean} debug - Enable debug logging
 * @returns {Buffer} Status request packet
 */
function createStatusRequestPacket(debug = false) {
  // Status request is simply a packet with ID 0x00 and no payload
  const packetId = Buffer.from([0x00]);
  const packetLengthBuffer = varintEncode(packetId.length);
  
  if (debug) {
    console.log('Status request packet ID:', packetId.toString('hex'));
    console.log('Status request packet length buffer:', packetLengthBuffer.toString('hex'));
  }
  
  return Buffer.concat([packetLengthBuffer, packetId]);
}

/**
 * Create an RCON packet
 * @param {number} type - Packet type
 * @param {number} id - Packet ID
 * @param {string} payload - Packet payload
 * @param {boolean} debug - Enable debug logging
 * @returns {Buffer} RCON packet
 */
function createRconPacket(type, id, payload, debug = false) {
  // RCON Packet format:
  // 4 bytes: Length (excluding this field)
  // 4 bytes: Request ID
  // 4 bytes: Type
  // n bytes: Payload
  // 2 bytes: Padding (nulls)
  
  const payloadBuffer = Buffer.from(payload + '\0', 'utf8');
  const length = 4 + 4 + payloadBuffer.length; // id + type + payload with null terminator
  
  const packet = Buffer.alloc(4 + length); // 4 bytes for length field + payload length
  
  // Write length (little endian)
  packet.writeInt32LE(length, 0);
  
  // Write request ID (little endian)
  packet.writeInt32LE(id, 4);
  
  // Write type (little endian)
  packet.writeInt32LE(type, 8);
  
  // Write payload
  payloadBuffer.copy(packet, 12);
  
  if (debug) {
    console.log('RCON packet:', {
      length,
      id,
      type,
      payloadLength: payloadBuffer.length
    });
  }
  
  return packet;
}

/**
 * Parse an RCON packet
 * @param {Buffer} data - The packet data
 * @param {boolean} debug - Enable debug logging
 * @returns {Object} Parsed packet information
 */
function parseRconPacket(data, debug = false) {
  if (data.length < 12) {
    throw new Error('Invalid RCON packet (too short)');
  }
  
  const length = data.readInt32LE(0);
  const id = data.readInt32LE(4);
  const type = data.readInt32LE(8);
  
  if (debug) {
    console.log(`RCON packet - Length: ${length}, ID: ${id}, Type: ${type}`);
  }
  
  // Check if we have the complete packet
  if (data.length < 4 + length) {
    throw new Error('Incomplete RCON packet');
  }
  
  // Extract the payload (excluding the null terminator)
  const payloadEnd = 4 + length - 2; // -2 for the null padding
  const payload = data.toString('utf8', 12, payloadEnd);
  
  return {
    length,
    id,
    type,
    payload
  };
}

/**
 * Parse the status response from the server
 * @param {Buffer} data - The received data
 * @param {boolean} debug - Enable debug logging
 * @returns {Object} Parsed server status
 */
function parseStatusResponse(data, debug = false) {
  let offset = 0;
  
  // Read packet length
  const packetLengthResult = readVarInt(data, offset);
  const packetLength = packetLengthResult.value;
  offset += packetLengthResult.size;
  
  if (debug) console.log(`Packet length: ${packetLength}, offset now: ${offset}`);
  
  if (data.length < offset + packetLength) {
    if (debug) console.log(`Incomplete data: have ${data.length} bytes, need ${offset + packetLength}`);
    throw new Error('Incomplete data');
  }
  
  // Read packet ID
  const packetIdResult = readVarInt(data, offset);
  const packetId = packetIdResult.value;
  offset += packetIdResult.size;
  
  if (debug) console.log(`Packet ID: 0x${packetId.toString(16)}, offset now: ${offset}`);
  
  if (packetId !== 0x00) {
    throw new Error(`Unexpected packet ID: 0x${packetId.toString(16)}`);
  }
  
  // Read JSON response length
  const jsonLengthResult = readVarInt(data, offset);
  const jsonLength = jsonLengthResult.value;
  offset += jsonLengthResult.size;
  
  if (debug) console.log(`JSON length: ${jsonLength}, offset now: ${offset}`);
  
  if (data.length < offset + jsonLength) {
    if (debug) console.log(`Incomplete JSON: have ${data.length - offset} bytes, need ${jsonLength}`);
    throw new Error('Incomplete data');
  }
  
  // Read JSON response
  const jsonStr = data.toString('utf8', offset, offset + jsonLength);
  
  if (debug) {
    console.log('JSON string:', jsonStr.substring(0, 100) + (jsonStr.length > 100 ? '...' : ''));
  }
  
  try {
    const response = JSON.parse(jsonStr);
    return response;
  } catch (e) {
    if (debug) console.log('JSON parse error:', e.message);
    throw new Error(`Failed to parse server response: ${e.message}`);
  }
}

/**
 * Encode a number as a VarInt
 * @param {number} value - The number to encode
 * @returns {Buffer} Encoded VarInt
 */
function varintEncode(value) {
  const bytes = [];
  
  // Handle negative numbers correctly for protocol version
  if (value < 0) {
    // For negative protocol version (-1), convert to the appropriate representation
    // In two's complement with 32 bits, -1 is represented as 0xFFFFFFFF
    value = (1 << 32) + value;
  }
  
  do {
    let temp = value & 0x7F;
    value >>>= 7;
    if (value !== 0) {
      temp |= 0x80;
    }
    bytes.push(temp);
  } while (value !== 0);
  
  return Buffer.from(bytes);
}

/**
 * Read a VarInt from a buffer
 * @param {Buffer} buffer - The buffer to read from
 * @param {number} offset - The offset to start reading from
 * @returns {Object} The read value and its size in bytes
 */
function readVarInt(buffer, offset) {
  let value = 0;
  let position = 0;
  let currentByte;
  
  do {
    if (offset + position >= buffer.length) {
      throw new Error('Incomplete data');
    }
    
    currentByte = buffer[offset + position];
    value |= (currentByte & 0x7F) << (position * 7);
    
    position++;
    
    if (position > 5) {
      throw new Error('VarInt too big');
    }
  } while ((currentByte & 0x80) !== 0);
  
  return { value, size: position };
}