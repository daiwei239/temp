import { useEffect, useRef, useState } from "react";
import { getWebSocketUrl } from "../lib/backendUrl";

interface Handlers {
  onStatusChange?: (msg: string) => void;
  onStep1Stream?: (content: string) => void;
  onStep1Done?: (data: any) => void;
}

export function usePaperStream(paperId: string | null, handlers: Handlers) {
  const wsRef = useRef<WebSocket | null>(null);
  const intentionalCloseRef = useRef(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!paperId) return;
    handlers.onStatusChange?.("正在连接后端 WebSocket...");

    const ws = new WebSocket(getWebSocketUrl(`/ws/paper/${paperId}`));
    wsRef.current = ws;
    intentionalCloseRef.current = false;

    const connectTimer = window.setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        handlers.onStatusChange?.("WebSocket 连接超时，请检查后端地址、8002 端口或防火墙。");
      }
    }, 6000);

    ws.onopen = () => {
      window.clearTimeout(connectTimer);
      setConnected(true);
      handlers.onStatusChange?.("WebSocket 已连接。");
    };

    ws.onclose = () => {
      window.clearTimeout(connectTimer);
      setConnected(false);
      if (!intentionalCloseRef.current) {
        handlers.onStatusChange?.("WebSocket 连接已断开。");
      }
    };

    ws.onerror = () => {
      window.clearTimeout(connectTimer);
      setConnected(false);
      handlers.onStatusChange?.("WebSocket 连接失败，请检查后端地址、8002 端口或防火墙。");
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case "status_change":
          handlers.onStatusChange?.(data.msg);
          break;
        case "step1_stream":
          handlers.onStep1Stream?.(data.content);
          break;
        case "step1_done":
          handlers.onStep1Done?.(data.data);
          break;
        default:
          break;
      }
    };

    return () => {
      intentionalCloseRef.current = true;
      window.clearTimeout(connectTimer);
      ws.close();
    };
  }, [paperId]);

  const sendAction = (action: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ action }));
  };

  return { sendAction, connected };
}
