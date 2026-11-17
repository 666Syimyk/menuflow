param(
  [string]$BaseUrl = 'http://localhost:3001/api/v1'
)

$ErrorActionPreference = 'Stop'

function Login([string]$Login, [string]$Password) {
  Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/login" `
    -ContentType 'application/json' `
    -Body (@{ login = $Login; password = $Password } | ConvertTo-Json)
}

function AuthHeaders([string]$Token) {
  @{ Authorization = "Bearer $Token" }
}

function ExpectFailure(
  [string]$Method,
  [string]$Uri,
  [object]$Body,
  [hashtable]$Headers
) {
  try {
    if ($Method -eq 'Get') {
      Invoke-RestMethod -Method Get -Uri $Uri -Headers $Headers | Out-Null
    } else {
      Invoke-RestMethod -Method $Method -Uri $Uri -Headers $Headers `
        -ContentType 'application/json' `
        -Body ($Body | ConvertTo-Json -Depth 8) | Out-Null
    }
    return 'unexpected-success'
  } catch {
    $status = $_.Exception.Response.StatusCode
    if ($status.value__) { return [int]$status.value__ }
    if ($status) { return [int]$status }
    return 'request-failed'
  }
}

$summary = [ordered]@{}
$summary.health = (Invoke-RestMethod "$BaseUrl/health").status

$super = Login 'superadmin' 'superadmin123'
$admin = Login 'admin_demo' 'admin123'
$waiter = Login 'waiter1' 'waiter123'
$cook = Login 'cook1' 'cook123'
$cashier = Login 'cashier1' 'cashier123'
$summary.roleLogins = @(
  $super.user.role,
  $admin.user.role,
  $waiter.user.role,
  $cook.user.role,
  $cashier.user.role
) -join ','

$adminHeaders = AuthHeaders $admin.accessToken
$waiterHeaders = AuthHeaders $waiter.accessToken
$cookHeaders = AuthHeaders $cook.accessToken
$cashierHeaders = AuthHeaders $cashier.accessToken
$superHeaders = AuthHeaders $super.accessToken

$summary.adminCannotCreateSuper = ExpectFailure 'Post' `
  "$BaseUrl/admin/staff" `
  @{ name = 'Bad Role'; login = 'bad_role_user'; password = 'secret123'; role = 'SUPER_ADMIN' } `
  $adminHeaders

$qrToken = $env:MENUFLOW_E2E_QR_TOKEN
if (-not $qrToken) {
  throw 'Set MENUFLOW_E2E_QR_TOKEN to an active QR token before running.'
}

$menu = Invoke-RestMethod "$BaseUrl/public/menu/$qrToken"
$summary.menuCategories = $menu.categories.Count
$summary.emptyOrder = ExpectFailure 'Post' `
  "$BaseUrl/public/orders/$qrToken" @{ items = @() } @{}

$order = Invoke-RestMethod -Method Post `
  -Uri "$BaseUrl/public/orders/$qrToken" `
  -ContentType 'application/json' `
  -Body (@{
    clientComment = 'E2E order'
    items = @(@{ dishId = 'd1'; qty = 1; addonIds = @() })
  } | ConvertTo-Json -Depth 8)

$summary.orderCreated = [bool]($order.id -and $order.publicToken)
$status = Invoke-RestMethod "$BaseUrl/public/orders/status/$($order.publicToken)"
$summary.secureStatus = $status.status
$summary.oldStatusEndpoint = ExpectFailure 'Get' `
  "$BaseUrl/public/orders/$($order.id)/status" @{} @{}

Invoke-RestMethod -Method Patch `
  -Uri "$BaseUrl/waiter/orders/$($order.id)/status" `
  -Headers $waiterHeaders -ContentType 'application/json' `
  -Body (@{ status = 'ACCEPTED' } | ConvertTo-Json) | Out-Null
Invoke-RestMethod -Method Patch `
  -Uri "$BaseUrl/kitchen/orders/$($order.id)/start" `
  -Headers $cookHeaders | Out-Null
Invoke-RestMethod -Method Patch `
  -Uri "$BaseUrl/kitchen/orders/$($order.id)/ready" `
  -Headers $cookHeaders | Out-Null
Invoke-RestMethod -Method Patch `
  -Uri "$BaseUrl/waiter/orders/$($order.id)/status" `
  -Headers $waiterHeaders -ContentType 'application/json' `
  -Body (@{ status = 'DELIVERING' } | ConvertTo-Json) | Out-Null
Invoke-RestMethod -Method Patch `
  -Uri "$BaseUrl/waiter/orders/$($order.id)/status" `
  -Headers $waiterHeaders -ContentType 'application/json' `
  -Body (@{ status = 'SERVED' } | ConvertTo-Json) | Out-Null

$bill = Invoke-RestMethod -Method Post `
  -Uri "$BaseUrl/public/calls/$qrToken/bill" `
  -ContentType 'application/json' `
  -Body (@{ publicToken = $order.publicToken } | ConvertTo-Json)
$summary.billLinked = $bill.orderId -eq $order.id

$summary.underpayment = ExpectFailure 'Post' `
  "$BaseUrl/cashier/payments" `
  @{ orderId = $order.id; method = 'CASH'; amount = 1 } `
  $cashierHeaders

Invoke-RestMethod -Method Post -Uri "$BaseUrl/cashier/payments" `
  -Headers $cashierHeaders -ContentType 'application/json' `
  -Body (@{
    orderId = $order.id
    method = 'CASH'
    amount = [double]$order.total
  } | ConvertTo-Json) | Out-Null

$paid = Invoke-RestMethod "$BaseUrl/public/orders/status/$($order.publicToken)"
$summary.paidStatus = $paid.status
Invoke-RestMethod -Method Patch `
  -Uri "$BaseUrl/admin/orders/$($order.id)/status" `
  -Headers $adminHeaders -ContentType 'application/json' `
  -Body (@{ status = 'CLOSED' } | ConvertTo-Json) | Out-Null
$closed = Invoke-RestMethod "$BaseUrl/public/orders/status/$($order.publicToken)"
$summary.closedStatus = $closed.status

$dashboard = Invoke-RestMethod -Uri "$BaseUrl/admin/reports/dashboard" `
  -Headers $adminHeaders
$summary.dashboardOrders = $dashboard.ordersToday

$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$restaurant = Invoke-RestMethod -Method Post `
  -Uri "$BaseUrl/super/restaurants" -Headers $superHeaders `
  -ContentType 'application/json' `
  -Body (@{ name = "E2E Restaurant $suffix"; currency = 'KGS' } | ConvertTo-Json)
$tempLogin = "e2e_admin_$suffix"
Invoke-RestMethod -Method Post -Uri "$BaseUrl/super/users/admin" `
  -Headers $superHeaders -ContentType 'application/json' `
  -Body (@{
    restaurantId = $restaurant.id
    name = 'E2E Admin'
    login = $tempLogin
    password = 'e2e-password'
  } | ConvertTo-Json) | Out-Null

$summary.loginWithoutSubscription = ExpectFailure 'Post' `
  "$BaseUrl/auth/login" `
  @{ login = $tempLogin; password = 'e2e-password' } @{}
$plans = Invoke-RestMethod -Uri "$BaseUrl/super/plans" -Headers $superHeaders
Invoke-RestMethod -Method Post -Uri "$BaseUrl/super/subscriptions" `
  -Headers $superHeaders -ContentType 'application/json' `
  -Body (@{
    restaurantId = $restaurant.id
    planId = $plans[0].id
    days = 30
  } | ConvertTo-Json) | Out-Null
$tempAuth = Login $tempLogin 'e2e-password'
$summary.loginWithSubscription = $tempAuth.user.role
Invoke-RestMethod -Method Patch `
  -Uri "$BaseUrl/super/restaurants/$($restaurant.id)/block" `
  -Headers $superHeaders -ContentType 'application/json' -Body '{}' | Out-Null
$summary.blockedRestaurantLogin = ExpectFailure 'Post' `
  "$BaseUrl/auth/login" `
  @{ login = $tempLogin; password = 'e2e-password' } @{}

$summary | ConvertTo-Json -Depth 5
