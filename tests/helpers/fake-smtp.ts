import { createServer, type Server } from "node:net";
import type { AddressInfo } from "node:net";

/** Servidor SMTP mínimo (sem TLS/autenticação) que guarda as mensagens recebidas. */
export async function startFakeSmtp() {
  const messages: { from: string; to: string[]; data: string }[] = [];
  const server: Server = createServer((socket) => {
    let buffer = "";
    let inData = false;
    let current = { from: "", to: [] as string[], data: "" };
    socket.write("220 fake-smtp\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      for (;;) {
        if (inData) {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end === -1) return;
          current.data = buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          messages.push(current);
          current = { from: "", to: [], data: "" };
          inData = false;
          socket.write("250 OK\r\n");
          continue;
        }
        const line = buffer.indexOf("\r\n");
        if (line === -1) return;
        const command = buffer.slice(0, line);
        buffer = buffer.slice(line + 2);
        const verb = command.slice(0, 4).toUpperCase();
        if (verb === "EHLO" || verb === "HELO") socket.write("250-fake-smtp\r\n250 8BITMIME\r\n");
        else if (verb === "MAIL") (current.from = command), socket.write("250 OK\r\n");
        else if (verb === "RCPT") current.to.push(command), socket.write("250 OK\r\n");
        else if (verb === "DATA") (inData = true), socket.write("354 go ahead\r\n");
        else if (verb === "QUIT") socket.end("221 bye\r\n");
        else socket.write("250 OK\r\n");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: (server.address() as AddressInfo).port,
    messages,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Corpo decodificado (quoted-printable simples) para procurar textos no e-mail. */
export function decodeMail(data: string) {
  return data.replace(/=\r\n/g, "").replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}
