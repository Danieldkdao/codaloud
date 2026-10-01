import { WebSocket } from "ws";

export const retainTerminalHeartbeat = (socket: WebSocket) => {
  let responsive = true;
  const pong = () => {
    responsive = true;
  };
  const release = () => {
    clearInterval(timer);
    socket.off("pong", pong);
    socket.off("close", release);
  };
  socket.on("pong", pong);
  socket.once("close", release);
  // Protocol pings keep idle tunnels active without touching the user's shell.
  const timer = setInterval(() => {
    if (socket.readyState !== WebSocket.OPEN) return release();
    if (!responsive) {
      release();
      socket.terminate();
      return;
    }
    responsive = false;
    try {
      socket.ping();
    } catch {
      release();
      socket.terminate();
    }
  }, 20_000);
  timer.unref();
};
