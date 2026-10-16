/** Runs the MCP server over stdio until the client closes the stream. */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer, type McpServerOptions } from './server.js';

export async function runMcpStdio(options: McpServerOptions): Promise<void> {
  const server = createMcpServer(options);
  const transport = new StdioServerTransport();
  const closed = new Promise<void>((done) => {
    transport.onclose = () => done();
  });
  await server.connect(transport);
  await closed;
}
