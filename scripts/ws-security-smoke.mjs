import { io } from 'socket.io-client'

const apiBase = process.env.MENUFLOW_API_URL ?? 'http://localhost:3001/api/v1'
const socketUrl = process.env.MENUFLOW_WS_URL ?? 'http://localhost:3001'
const publicToken = process.env.MENUFLOW_E2E_ORDER_TOKEN

if (!publicToken) {
  throw new Error('Set MENUFLOW_E2E_ORDER_TOKEN before running.')
}

function waitFor(socket, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event}`)),
      timeout,
    )
    socket.once(event, (data) => {
      clearTimeout(timer)
      resolve(data)
    })
  })
}

const invalidGuest = io(socketUrl)
await waitFor(invalidGuest, 'connect')
invalidGuest.emit('subscribe:order', { publicToken: 'invalid-token' })
const invalidError = await waitFor(invalidGuest, 'error')
invalidGuest.disconnect()

const guest = io(socketUrl)
await waitFor(guest, 'connect')
guest.emit('subscribe:order', { publicToken })

const loginResponse = await fetch(`${apiBase}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ login: 'waiter1', password: 'waiter123' }),
})
const auth = await loginResponse.json()
const updatePromise = waitFor(guest, 'order:updated')
const updateResponse = await fetch(
  `${apiBase}/waiter/orders/demo-order-new/status`,
  {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${auth.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ status: 'ACCEPTED' }),
  },
)
if (!updateResponse.ok) {
  throw new Error(`Waiter update failed: ${updateResponse.status}`)
}
const update = await updatePromise
guest.disconnect()

const invalidJwt = io(socketUrl, {
  auth: { token: 'not-a-jwt' },
})
const authErrorPromise = waitFor(invalidJwt, 'error')
const disconnectPromise = waitFor(invalidJwt, 'disconnect')
const [authError] = await Promise.all([authErrorPromise, disconnectPromise])

console.log(
  JSON.stringify(
    {
      invalidOrderRejected: invalidError?.message === 'Order not found',
      validOrderEventReceived: update?.id === 'demo-order-new',
      invalidJwtRejected: authError?.message === 'Authentication failed',
    },
    null,
    2,
  ),
)
