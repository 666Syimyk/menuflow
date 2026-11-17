import json
from typing import Any
from fastapi import WebSocket
from collections import defaultdict


class ConnectionManager:
    """
    Manages WebSocket connections grouped by restaurant rooms.
    Rooms: kitchen:{restaurant_id}, waiter:{restaurant_id}, admin:{restaurant_id}, order:{order_public_token}
    """

    def __init__(self):
        self._connections: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, websocket: WebSocket, room: str) -> None:
        await websocket.accept()
        self._connections[room].append(websocket)

    def disconnect(self, websocket: WebSocket, room: str) -> None:
        room_conns = self._connections.get(room, [])
        if websocket in room_conns:
            room_conns.remove(websocket)

    async def broadcast(self, room: str, event: str, data: Any) -> None:
        payload = json.dumps({"event": event, "data": data}, default=str)
        dead: list[WebSocket] = []
        for ws in list(self._connections.get(room, [])):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, room)

    async def broadcast_to_restaurant(self, restaurant_id: str, role: str, event: str, data: Any) -> None:
        room = f"{role}:{restaurant_id}"
        await self.broadcast(room, event, data)

    async def broadcast_order_update(self, order_public_token: str, event: str, data: Any) -> None:
        room = f"order:{order_public_token}"
        await self.broadcast(room, event, data)


ws_manager = ConnectionManager()
