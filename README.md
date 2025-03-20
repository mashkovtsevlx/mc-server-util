# Minecraft Server Utilities 🛠️

A modern Node.js library for interacting with Minecraft Java Edition servers. Query server status and execute RCON commands with ease.

## Features ✨

- ✅ Server status checking (MOTD, players, version)
- 🔑 Secure RCON command execution
- 📢 Built-in `say` command helper
- ⏱️ Configurable timeouts (10s default)
- 🔍 Debug logging capabilities
- 🛡️ Comprehensive error handling

## Installation 📦

```bash
npm install mc-server-utils
```

## Usage Examples 🚀

### Basic Server Status Check
```javascript
import { getMinecraftServerStatus } from 'mc-server-utils';

try {
  const status = await getMinecraftServerStatus('mc.example.com');
  console.log(`Server version: ${status.version.name}`);
  console.log(`Players online: ${status.players.online}`);
} catch (error) {
  console.error('Server offline:', error.message);
}
```

### Execute RCON Command
```javascript
import { sendRconCommand } from 'mc-server-utils';

const response = await sendRconCommand(
  'mc.example.com',
  25575,
  'secure-password',
  'whitelist add PlayerName'
);
console.log('Command response:', response);
```

### Broadcast Server Message
```javascript
import { sendRconSayCommand } from 'mc-server-utils';

await sendRconSayCommand(
  'mc.example.com',
  'secure-password',
  'Server maintenance in 5 minutes!'
);
```

## API Documentation 📖

### `getMinecraftServerStatus(host, [port = 25565], [debug = false])`
**Returns:** `Promise<ServerStatus>`

**ServerStatus Object:**
```typescript
{
  online: boolean,
  version: {
    name: string,
    protocol: number
  },
  players: {
    max: number,
    online: number,
    sample?: Player[],
    nicknames?: string
  },
  description: string,
  favicon?: string
}
```

### `sendRconCommand(host, [port = 25575], password, command, [debug = false])`
**Returns:** `Promise<string>`

### `sendRconSayCommand(host, password, message, [debug = false])`
**Returns:** `Promise<string>`

## Advanced Configuration ⚙️

### Debug Mode
```javascript
// Enable debug logging
await getMinecraftServerStatus('mc.example.com', 25565, true);

// Example debug output:
// Connected to server, sending handshake
// Handshake packet: 0f0000...
// Received data chunk: 0f0000...
```

### Custom Timeout
```javascript
// Create custom timeout (in milliseconds)
const status = await getMinecraftServerStatus('mc.example.com', 25565, {
  debug: false,
  timeout: 15000
});
```

## Error Handling ⚠️
Common error scenarios:
- `Connection timeout` - Server not responding
- `RCON authentication failed` - Incorrect password
- `Invalid RCON packet` - Protocol mismatch

**Example error handling:**
```javascript
try {
  await sendRconCommand('mc.example.com', 25575, 'wrong-password', 'help');
} catch (error) {
  if (error.message.includes('authentication failed')) {
    console.error('Invalid RCON credentials');
  } else {
    console.error('Connection error:', error.message);
  }
}
```

## Security Best Practices 🔒
1. **Never hardcode credentials**  
   Use environment variables:
   ```javascript
   import dotenv from 'dotenv';
   dotenv.config();
   
   sendRconCommand(
     process.env.MC_HOST,
     process.env.MC_RCON_PORT,
     process.env.MC_RCON_PASSWORD,
     'save-all'
   );
   ```

2. **Validate user input**  
   Sanitize command inputs:
   ```javascript
   const sanitizeInput = (input) => input.replace(/[^\w\s-]/g, '');
   const safeCommand = sanitizeInput(userInput);
   ```

## Contributing 🤝
We welcome contributions! Please follow these steps:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit changes with descriptive messages
4. Push to your branch (`git push origin feature/your-feature`)
5. Open a Pull Request

## License 📄
MIT © Alex Mashkovtsev

---

**Protocol Reference**  
For low-level protocol details, see the [Minecraft Protocol Specification](https://wiki.vg/Protocol).