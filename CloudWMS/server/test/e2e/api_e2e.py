"""End-to-end API test: authentication, roles, warehouse isolation, concurrency.

Run against a DISPOSABLE database - it creates warehouses, employees and products.

    API_URL=http://localhost:3000/api ADMIN_EMAIL=admin@technova.local     ADMIN_PASSWORD=... python test/e2e/api_e2e.py

The API must run with LOGIN_RATE_LIMIT_PER_MINUTE raised (e.g. 1000): this suite signs
in more than 10 times a minute. Exit code 0 = all checks passed.
"""
import json
import os
import secrets
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

API = os.environ.get("API_URL", "http://localhost:3000/api")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@technova.local")
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]
# Unique per run so the suite can be re-run against the same database
RUN = secrets.token_hex(3).upper()
WH2 = f"T-{RUN}"
results = []


def call(method, path, body=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(API + path, method=method, headers=headers,
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw.decode()


def check(name, cond, detail=""):
    results.append(bool(cond))
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f"  -> {detail}" if detail and not cond else ""))


def login(email, pw):
    s, b = call("POST", "/auth/login", {"email": email, "password": pw})
    return b["accessToken"] if s == 200 else None


print("== Authentication")
s, _ = call("GET", "/health"); check("health is public", s == 200)
s, _ = call("GET", "/products"); check("no token -> 401", s == 401)
s, _ = call("GET", "/products", token="garbage.token.value"); check("garbage token -> 401", s == 401)
s, b1 = call("POST", "/auth/login", {"email": ADMIN_EMAIL, "password": "wrong-password"})
s2, b2 = call("POST", "/auth/login", {"email": "nobody@technova.local", "password": "wrong-password"})
check("wrong password and unknown email give identical 401", s == s2 == 401 and b1["message"] == b2["message"], f"{b1} / {b2}")
ADMIN = login(ADMIN_EMAIL, ADMIN_PASSWORD); check("admin can sign in", bool(ADMIN))
s, me = call("GET", "/auth/me", token=ADMIN)
check("/auth/me returns role + company + warehouses", s == 200 and me["role"] == "ADMIN" and me["company"]["name"] and me["warehouses"], me)
HUB1 = me["warehouses"][0]["id"]
parts = ADMIN.split(".")
forged = parts[0] + "." + parts[1][:-2] + "AA" + "." + parts[2]
s, _ = call("GET", "/products", token=forged); check("tampered token -> 401", s == 401)

print("== Admin: warehouses and employees")
s, w2 = call("POST", "/warehouses", {"code": WH2, "name": "South Facility", "address": "12 Dock Rd"}, ADMIN)
check("admin creates second warehouse", s == 201, w2); HUB2 = w2["id"]
s, _ = call("POST", "/warehouses", {"code": WH2, "name": "Dup"}, ADMIN); check("duplicate warehouse code -> 409", s == 409)
users = {
    "manager": {"email": f"maria.manager.{RUN.lower()}@technova.test", "firstName": "Maria", "lastName": "Manager", "role": "MANAGER", "warehouseIds": [HUB1]},
    "staff1": {"email": f"sam.staff.{RUN.lower()}@technova.test", "firstName": "Sam", "lastName": "Staff", "role": "STAFF", "warehouseIds": [HUB1, HUB2]},
    "staff2": {"email": f"sara.south.{RUN.lower()}@technova.test", "firstName": "Sara", "lastName": "South", "role": "STAFF", "warehouseIds": [HUB2]},
    "viewer": {"email": f"victor.viewer.{RUN.lower()}@technova.test", "firstName": "Victor", "lastName": "Viewer", "role": "VIEWER", "warehouseIds": [HUB1]},
}
ids = {}
for k, u in users.items():
    s, b = call("POST", "/users", {**u, "password": "Employee-Pass-1"}, ADMIN)
    check(f"admin creates {u['role']} {u['email']}", s == 201, b)
    ids[k] = b["id"]
    check(f"  response has no password data", "passwordHash" not in json.dumps(b))
s, b = call("POST", "/users", {**users["staff2"], "email": f"x.{RUN.lower()}@technova.test", "password": "short"}, ADMIN)
check("weak password rejected (400)", s == 400)
s, b = call("POST", "/users", {"email": f"y.{RUN.lower()}@technova.test", "firstName": "Y", "role": "STAFF", "password": "Employee-Pass-1"}, ADMIN)
check("STAFF without warehouses rejected (400)", s == 400)
T = {k: login(u["email"], "Employee-Pass-1") for k, u in users.items()}
check("all employees can sign in", all(T.values()))

print("== Role checks")
s, _ = call("GET", "/users", token=T["manager"]); check("manager cannot list users (403)", s == 403)
s, _ = call("POST", "/warehouses", {"code": f"X-{RUN}", "name": "x"}, T["manager"]); check("manager cannot create warehouses (403)", s == 403)
prod = {"sku": f"E2E-{RUN}-01", "name": "Auth Test Item", "category": "Hardware", "unitOfMeasurement": "pcs", "minimumStockLevel": 2}
s, _ = call("POST", "/products", prod, T["staff1"]); check("staff cannot create products (403)", s == 403)
s, p = call("POST", "/products", prod, T["manager"]); check("manager creates product", s == 201, p); PID = p["id"]
s, _ = call("DELETE", f"/products/{PID}", token=T["manager"]); check("manager cannot delete products (403)", s == 403)
s, _ = call("POST", "/inventory/stock-in", {"warehouseId": HUB1, "productId": PID, "quantity": 5, "reference": "PO-V"}, T["viewer"])
check("viewer cannot stock in (403)", s == 403)
s, _ = call("GET", f"/inventory?warehouseId={HUB1}", token=T["viewer"]); check("viewer can read own warehouse", s == 200)

print("== Warehouse isolation")
s, _ = call("GET", f"/inventory?warehouseId={HUB1}", token=T["staff2"]); check("HUB-02 staff cannot read HUB-01 (403)", s == 403)
s, inv2 = call("GET", f"/inventory?warehouseId={HUB2}", token=T["staff2"]); check("HUB-02 staff reads HUB-02", s == 200)
s, r = call("POST", "/inventory/stock-in", {"warehouseId": HUB2, "productId": PID, "quantity": 30, "reference": "PO-S-1"}, T["staff2"])
check("HUB-02 staff stocks in to HUB-02", s == 200 and r["quantityAfter"] == 30 and r["performedBy"] == users["staff2"]["email"], r)
s, _ = call("POST", "/inventory/stock-in", {"warehouseId": HUB1, "productId": PID, "quantity": 5, "reference": "PO-X"}, T["staff2"])
check("HUB-02 staff cannot stock in to HUB-01 (403)", s == 403)
s, r = call("POST", "/inventory/stock-in", {"warehouseId": HUB1, "productId": PID, "quantity": 7, "reference": "PO-M-1"}, T["manager"])
check("manager stocks in to HUB-01", s == 200 and r["quantityAfter"] == 7, r)
s, _ = call("POST", "/inventory/adjust", {"warehouseId": HUB2, "productId": PID, "newQuantity": 1, "reference": "ADJ"}, T["staff2"])
check("staff cannot adjust (403)", s == 403)
s, _ = call("POST", "/inventory/adjust", {"warehouseId": HUB2, "productId": PID, "newQuantity": 1, "reference": "ADJ"}, T["manager"])
check("HUB-01 manager cannot adjust HUB-02 (403)", s == 403)
s, r = call("POST", "/inventory/adjust", {"warehouseId": HUB1, "productId": PID, "newQuantity": 6, "reference": "ADJ-1"}, T["manager"])
check("manager adjusts own warehouse", s == 200 and r["delta"] == -1, r)
s, prods = call("GET", "/products", token=T["staff2"])
mine = next(x for x in prods if x["id"] == PID)
check("HUB-02 staff sees only HUB-02 stock in product totals", mine["totalQuantity"] == 30 and [w["code"] for w in mine["stockByWarehouse"]] == [WH2], mine)
s, prods = call("GET", "/products", token=T["staff1"])
both = next(x for x in prods if x["id"] == PID)
check("staff in both warehouses sees combined total 36", both["totalQuantity"] == 36, both)
s, txs = call("GET", "/inventory/transactions", token=T["staff2"])
check("HUB-02 staff ledger only contains HUB-02", s == 200 and txs and all(t["warehouse"]["code"] == WH2 for t in txs), [t.get("warehouse") for t in txs][:3])
s, txs = call("GET", "/inventory/transactions?limit=5", token=ADMIN)
check("ledger records who did it, never password data", s == 200 and txs[0]["user"]["email"] and "passwordHash" not in json.dumps(txs))
s, ws = call("GET", "/warehouses", token=T["staff2"])
check("staff only sees assigned warehouses", s == 200 and [w["code"] for w in ws] == [WH2], ws)

print("== Concurrency (row lock + first-use row creation)")
s, p2 = call("POST", "/products", {**prod, "sku": f"E2E-{RUN}-02"}, T["manager"]); PID2 = p2["id"]
def stock_in(_):
    return call("POST", "/inventory/stock-in", {"warehouseId": HUB2, "productId": PID2, "quantity": 1, "reference": "PO-RACE"}, T["staff1"])[0]
with ThreadPoolExecutor(20) as ex:
    codes = list(ex.map(stock_in, range(20)))
s, inv = call("GET", f"/inventory?warehouseId={HUB2}", token=T["staff1"])
q = next(i for i in inv if i["productId"] == PID2)["quantityOnHand"]
check("20 parallel first-time stock-ins all succeed and sum to 20", codes.count(200) == 20 and q == 20, f"codes={set(codes)} qty={q}")
def stock_out(_):
    return call("POST", "/inventory/stock-out", {"warehouseId": HUB2, "productId": PID2, "quantity": 3, "reference": "SO-RACE"}, T["staff1"])[0]
with ThreadPoolExecutor(10) as ex:
    codes = list(ex.map(stock_out, range(10)))
s, inv = call("GET", f"/inventory?warehouseId={HUB2}", token=T["staff1"])
q = next(i for i in inv if i["productId"] == PID2)["quantityOnHand"]
check("10 parallel dispatches of 3 from 20: exactly 6 succeed, 2 left", codes.count(200) == 6 and q == 2, f"ok={codes.count(200)} qty={q}")

print("== Session revocation and lockout")
s, _ = call("PATCH", f"/users/{ids['staff1']}", {"isActive": False}, ADMIN); check("admin deactivates staff1", s == 200)
s, _ = call("GET", "/products", token=T["staff1"]); check("deactivated user's existing token stops working immediately", s == 401)
s, _ = call("POST", "/auth/login", {"email": users["staff1"]["email"], "password": "Employee-Pass-1"}); check("deactivated user cannot sign in", s == 401)
s, b = call("PATCH", f"/users/{ids['viewer']}", {"warehouseIds": [HUB2]}, ADMIN)
s, _ = call("GET", f"/inventory?warehouseId={HUB1}", token=T["viewer"]); check("removing a warehouse assignment applies immediately", s == 403)
s, b = call("POST", "/auth/change-password", {"currentPassword": "Employee-Pass-1", "newPassword": "Brand-New-Pass-2"}, T["manager"])
check("manager changes own password", s == 200 and b.get("accessToken"), b)
s, _ = call("GET", "/products", token=T["manager"]); check("old token revoked after password change", s == 401)
s, _ = call("GET", "/products", token=b["accessToken"]); check("new token from password change works", s == 200)
for _ in range(5):
    call("POST", "/auth/login", {"email": users["staff2"]["email"], "password": "nope-nope-nope"})
s, b = call("POST", "/auth/login", {"email": users["staff2"]["email"], "password": "Employee-Pass-1"})
check("5 failed sign-ins lock the account, even the right password is refused", s == 401 and "locked" in b["message"].lower(), b)
s, _ = call("PATCH", f"/users/{ids['staff2']}", {"password": "Reset-By-Admin-3"}, ADMIN)
check("admin password reset unlocks", login(users["staff2"]["email"], "Reset-By-Admin-3") is not None)

print("== Self-protection")
s, b = call("PATCH", f"/users/{me['id']}", {"isActive": False}, ADMIN); check("admin cannot deactivate self (400)", s == 400)
s, b = call("PATCH", f"/users/{me['id']}", {"role": "STAFF", "warehouseIds": [HUB1]}, ADMIN); check("admin cannot demote self (400)", s == 400)

print("== Warehouse deactivation")
s, _ = call("PATCH", f"/warehouses/{HUB2}", {"isActive": False}, ADMIN)
s, b = call("POST", "/inventory/stock-in", {"warehouseId": HUB2, "productId": PID, "quantity": 1, "reference": "PO-Z"}, ADMIN)
check("no stock movements into an inactive warehouse (409)", s == 409, b)
call("PATCH", f"/warehouses/{HUB2}", {"isActive": True}, ADMIN)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
