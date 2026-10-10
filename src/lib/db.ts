import Database, { type QueryResult } from "@tauri-apps/plugin-sql";
import { Product, Sale, Client, Payment, Supplier, Invoice, CustomSaleCard, User, Expense, Category } from "./types";
import { DEFAULT_CATEGORIES } from "./store";
import { normalizeBarcode } from "./barcode";

const DB_FILENAME = "mimicha.db";
const LEGACY_DB_FILENAME = "novadeco.db";
const DB_URI = `sqlite:${DB_FILENAME}`;
const LEGACY_DB_URI = `sqlite:${LEGACY_DB_FILENAME}`;
const APP_TABLES = ["products", "clients", "suppliers", "sales", "payments", "invoices", "custom_cards", "users", "expenses", "categories"] as const;

type RawSaleRow = Omit<Sale, "items"> & { items: string };
type RawInvoiceRow = Omit<Invoice, "supplier" | "items"> & {
    supplier: string;
    items: string;
};

let db: Database | null = null;
let dbPromise: Promise<Database> | null = null;
let initPromise: Promise<Database> | null = null;

function isTauriRuntimeAvailable() {
    if (typeof window === "undefined") {
        return false;
    }

    const tauriInternals = (window as typeof window & {
        __TAURI_INTERNALS__?: { invoke?: unknown };
    }).__TAURI_INTERNALS__;

    return typeof tauriInternals?.invoke === "function";
}

function getTauriUnavailableError() {
    return new Error("Tauri runtime is not available. SQLite only works inside the Tauri desktop app.");
}

async function waitForTauriRuntime(timeoutMs = 5000, intervalMs = 50) {
    if (isTauriRuntimeAvailable()) {
        return;
    }

    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        await new Promise(resolve => window.setTimeout(resolve, intervalMs));

        if (isTauriRuntimeAvailable()) {
            return;
        }
    }

    throw getTauriUnavailableError();
}

function logSelect(query: string, bindValues: unknown[], result: unknown) {
    console.info("[db] SELECT result", { query, bindValues, result });
}

function logInsert(query: string, bindValues: unknown[], result: QueryResult) {
    console.info("[db] INSERT result", { query, bindValues, result });
}

async function runSelect<T>(database: Database, query: string, bindValues: unknown[] = []): Promise<T> {
    const result = await database.select<T>(query, bindValues);
    logSelect(query, bindValues, result);
    return result;
}

async function runExecute(database: Database, query: string, bindValues: unknown[] = []): Promise<QueryResult> {
    const result = await database.execute(query, bindValues);

    if (query.trim().toUpperCase().startsWith("INSERT")) {
        logInsert(query, bindValues, result);
    }

    return result;
}

async function createTables(database: Database) {
    await database.execute(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        nameAr TEXT,
        category TEXT NOT NULL,
        priceSale REAL NOT NULL,
        priceBuy REAL NOT NULL,
        stock REAL NOT NULL,
        unit TEXT NOT NULL,
                barcode TEXT,
                expiryDate TEXT,
                sizeStock TEXT
      )

    `);

    await database.execute(`
      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        balance REAL DEFAULT 0
      )
    `);

    await database.execute(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT
      )
    `);

    await database.execute(`
      CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        items TEXT NOT NULL,
        reduction REAL DEFAULT 0,
        total REAL NOT NULL,
        paidAmount REAL DEFAULT 0,
        creditAmount REAL DEFAULT 0,
        clientId TEXT,
        date TEXT NOT NULL,
        username TEXT
      )
    `);

    await database.execute(`
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        clientId TEXT NOT NULL,
        amount REAL NOT NULL,
        date TEXT NOT NULL,
        note TEXT,
        addedBy TEXT
      )
    `);

    await database.execute(`
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        number TEXT NOT NULL,
        supplier TEXT NOT NULL,
        items TEXT NOT NULL,
        total REAL NOT NULL,
        date TEXT NOT NULL,
        type TEXT NOT NULL,
        addedBy TEXT,
        editedBy TEXT
      )
    `);

    await database.execute(`
      CREATE TABLE IF NOT EXISTS custom_cards (
        id TEXT PRIMARY KEY,
        baseProductId TEXT NOT NULL,
        baseProductName TEXT NOT NULL,
        category TEXT NOT NULL,
        kg REAL NOT NULL,
        unitPrice REAL NOT NULL,
        priceBuyPerKg REAL
      )
    `);

    await database.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
      )
    `);

    await database.execute(`
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        amount REAL NOT NULL,
        date TEXT NOT NULL,
        note TEXT NOT NULL
      )
    `);

    await database.execute(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        label TEXT NOT NULL,
        labelAr TEXT NOT NULL,
        color TEXT NOT NULL,
        hoverColor TEXT NOT NULL,
        icon TEXT NOT NULL,
        customIcon TEXT,
        hasVentePersonnalisee INTEGER NOT NULL DEFAULT 0,
        hasTailles INTEGER NOT NULL DEFAULT 0,
        hasPointure INTEGER NOT NULL DEFAULT 0,
        sortOrder INTEGER NOT NULL DEFAULT 0
      )
    `);

    // Performance Indexes
    await database.execute(`CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date)`);
    await database.execute(`CREATE INDEX IF NOT EXISTS idx_sales_type ON sales(type)`);
    await database.execute(`CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(date)`);
    await database.execute(`CREATE INDEX IF NOT EXISTS idx_payments_client ON payments(clientId)`);
    await database.execute(`CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date)`);
    await database.execute(`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)`);
    await database.execute(`CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)`);
    await database.execute(`CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name)`);
    await database.execute(`CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)`);
}

async function hasAnyAppData(database: Database): Promise<boolean> {
    for (const table of APP_TABLES) {
        try {
            if (await getTableCount(database, table)) {
                return true;
            }
        } catch (e) {
            // table doesn't exist yet
        }
    }
    return false;
}

async function getTableCount(database: Database, table: string): Promise<number> {
    const res = await runSelect<{ count: number }[]>(database, `SELECT COUNT(*) as count FROM ${table}`);
    return res[0]?.count || 0;
}

async function upsertProducts(database: Database, products: Product[]) {
    for (const product of products) {
        await runExecute(
            database,
            "INSERT OR REPLACE INTO products (id, name, nameAr, category, priceSale, priceBuy, stock, unit, barcode, expiryDate, sizeStock) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
            [product.id, product.name, product.nameAr, product.category, product.priceSale, product.priceBuy, product.stock, product.unit, normalizeBarcode(product.barcode) || null, product.expiryDate || null, product.sizeStock ? JSON.stringify(product.sizeStock) : null]
        );

    }
}

async function upsertClients(database: Database, clients: Client[]) {
    for (const client of clients) {
        await runExecute(
            database,
            "INSERT OR REPLACE INTO clients (id, name, phone, balance) VALUES ($1, $2, $3, $4)",
            [client.id, client.name, client.phone, client.balance]
        );
    }
}

async function upsertSuppliers(database: Database, suppliers: Supplier[]) {
    for (const supplier of suppliers) {
        await runExecute(
            database,
            "INSERT OR REPLACE INTO suppliers (id, name, phone, address) VALUES ($1, $2, $3, $4)",
            [supplier.id, supplier.name, supplier.phone, supplier.address]
        );
    }
}

async function upsertInvoices(database: Database, invoices: Invoice[]) {
    for (const invoice of invoices) {
        await runExecute(
            database,
            "INSERT OR REPLACE INTO invoices (id, number, supplier, items, total, date, type, addedBy, editedBy) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
            [invoice.id, invoice.number, JSON.stringify(invoice.supplier), JSON.stringify(invoice.items), invoice.total, invoice.date, invoice.type, invoice.addedBy || null, invoice.editedBy || null]
        );
    }
}

async function replaceCustomCards(database: Database, cards: CustomSaleCard[]) {
    await database.execute("DELETE FROM custom_cards");

    for (const card of cards) {
        await runExecute(
            database,
            "INSERT OR REPLACE INTO custom_cards (id, baseProductId, baseProductName, category, kg, unitPrice, priceBuyPerKg) VALUES ($1, $2, $3, $4, $5, $6, $7)",
            [card.id, card.baseProductId, card.baseProductName, card.category, card.kg, card.unitPrice, card.priceBuyPerKg || null]
        );
    }
}

async function normalizeStoredProductBarcodes(database: Database) {
    const rows = await runSelect<{ id: string; barcode: unknown }[]>(
        database,
        "SELECT id, barcode FROM products WHERE barcode IS NOT NULL"
    );

    for (const row of rows) {
        const normalized = normalizeBarcode(row.barcode);
        if (normalized !== String(row.barcode)) {
            await database.execute(
                "UPDATE products SET barcode = $1 WHERE id = $2",
                [normalized || null, row.id]
            );
        }
    }
}

async function migrateLegacyDatabase(targetDb: Database) {
    if (!isTauriRuntimeAvailable()) return;
    const legacyDb = await Database.load(LEGACY_DB_URI);

    if (!(await hasAnyAppData(legacyDb))) {
        return;
    }

    console.info("[db] Migrating legacy database", {
        from: legacyDb.path,
        to: targetDb.path,
    });

    const [products, clients, suppliers, sales, payments, invoices, customCards] = await Promise.all([
        runSelect<Product[]>(legacyDb, "SELECT * FROM products"),
        runSelect<Client[]>(legacyDb, "SELECT * FROM clients"),
        runSelect<Supplier[]>(legacyDb, "SELECT * FROM suppliers"),
        runSelect<RawSaleRow[]>(legacyDb, "SELECT * FROM sales"),
        runSelect<Payment[]>(legacyDb, "SELECT * FROM payments"),
        runSelect<RawInvoiceRow[]>(legacyDb, "SELECT * FROM invoices"),
        runSelect<CustomSaleCard[]>(legacyDb, "SELECT * FROM custom_cards"),
    ]);

    await upsertProducts(targetDb, products);
    await upsertClients(targetDb, clients);
    await upsertSuppliers(targetDb, suppliers);

    for (const sale of sales) {
        await runExecute(
            targetDb,
            "INSERT OR REPLACE INTO sales (id, type, items, reduction, total, paidAmount, creditAmount, clientId, date, username) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
            [sale.id, sale.type, sale.items, sale.reduction, sale.total, sale.paidAmount, sale.creditAmount, sale.clientId || null, sale.date, (sale as any).username || null]
        );
    }

    for (const payment of payments) {
        await runExecute(
            targetDb,
            "INSERT OR REPLACE INTO payments (id, clientId, amount, date, note) VALUES ($1, $2, $3, $4, $5)",
            [payment.id, payment.clientId, payment.amount, payment.date, payment.note || null]
        );
    }

    for (const invoice of invoices) {
        await runExecute(
            targetDb,
            "INSERT OR REPLACE INTO invoices (id, number, supplier, items, total, date, type, addedBy, editedBy) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
            [invoice.id, invoice.number, invoice.supplier, invoice.items, invoice.total, invoice.date, invoice.type, (invoice as any).addedBy || null, (invoice as any).editedBy || null]
        );
    }

    await replaceCustomCards(targetDb, customCards);
}

export async function getDb() {
    await waitForTauriRuntime();

    if (db) {
        return db;
    }

    if (!dbPromise) {
        dbPromise = Database.load(DB_URI)
            .then((connection) => {
                db = connection;
                console.info(`[db] ${DB_FILENAME} path:`, connection.path);
                return connection;
            })
            .catch((error) => {
                dbPromise = null;
                throw error;
            });
    }

    return dbPromise;
}

export async function initDb() {
    await waitForTauriRuntime();

    if (!initPromise) {
        initPromise = (async () => {
            try {
                const database = await getDb();
                await createTables(database);

                // Defensive migrations: Add missing columns if they don't exist
                try {
                    await database.execute("ALTER TABLE products ADD COLUMN nameAr TEXT");
                } catch (e) { /* ignore if already exists */ }

                try {
                    await database.execute("ALTER TABLE products ADD COLUMN barcode TEXT");
                } catch (e) { /* ignore if already exists */ }

                try {
                    await database.execute("ALTER TABLE invoices ADD COLUMN type TEXT DEFAULT 'achat'");
                } catch (e) { /* ignore if already exists */ }

                try {
                    await database.execute("ALTER TABLE sales ADD COLUMN type TEXT DEFAULT 'direct'");
                } catch (e) { /* ignore if already exists */ }

                try {
                    await database.execute("ALTER TABLE sales ADD COLUMN username TEXT");
                } catch (e) { /* ignore if already exists */ }

                try {
                    await database.execute("ALTER TABLE invoices ADD COLUMN addedBy TEXT");
                } catch (e) { /* ignore if already exists */ }

                try {
                    await database.execute("ALTER TABLE products ADD COLUMN sizeStock TEXT");
                } catch (e) { /* ignore if already exists */ }

                try {
                    await database.execute("ALTER TABLE sales ADD COLUMN originalSaleId TEXT");
                } catch (e) { /* ignore if already exists */ }

                try {
                    await database.execute("ALTER TABLE payments ADD COLUMN addedBy TEXT");
                } catch (e) { /* ignore if already exists */ }

                // Ensure categories table contains only the 3 target default categories (Salon, Les Tables, Décoration)
                try {
                    const validKeys = DEFAULT_CATEGORIES.map(c => c.key);
                    await database.execute(
                        `DELETE FROM categories WHERE key NOT IN ('${validKeys.join("','")}')`
                    );

                    for (const cat of DEFAULT_CATEGORIES) {
                        await runExecute(
                            database,
                            "INSERT OR REPLACE INTO categories (id, key, label, labelAr, color, hoverColor, icon, customIcon, hasVentePersonnalisee, hasTailles, hasPointure, sortOrder) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
                            [cat.id, cat.key, cat.label, cat.labelAr, cat.color, cat.hoverColor, cat.icon, cat.customIcon || null, cat.hasVentePersonnalisee ? 1 : 0, cat.hasTailles ? 1 : 0, cat.hasPointure ? 1 : 0, cat.sortOrder]
                        );
                    }

                    // Update products with obsolete categories to 'les_tables'
                    await database.execute(
                        `UPDATE products SET category = 'les_tables' WHERE category NOT IN ('${validKeys.join("','")}')`
                    );
                } catch (e) {
                    console.error("Error migrating default categories:", e);
                }

                return database;
            } catch (error) {
                console.error("Failed to initialize database:", error);
                throw error;
            }
        })();
    }

    return initPromise;
}

function defaultProducts(): Product[] {
    return [];
}

// Products
export async function getProducts(): Promise<Product[]> {
    try {
        const database = await initDb();
        const rows = await runSelect<any[]>(database, "SELECT * FROM products ORDER BY name ASC");
        return rows.map(r => ({
            ...r,
            barcode: normalizeBarcode(r.barcode) || undefined,
            sizeStock: r.sizeStock ? JSON.parse(r.sizeStock) : undefined
        }));
    } catch (error) {

        console.error("error getting products", error);
        return [];
    }
}

export async function saveProducts(products: Product[]) {
    try {
        const database = await initDb();
        await upsertProducts(database, products);
    } catch (error) {
        console.error("error saving products", error);
        throw error;
    }
}

export async function updateProductStock(id: string, delta: number) {
    try {
        const database = await initDb();
        await database.execute("UPDATE products SET stock = MAX(0, stock + $1) WHERE id = $2", [delta, id]);
    } catch (error) {
        console.error("error updating product stock", error);
        throw error;
    }
}

export async function updateProduct(product: Product) {
    try {
        const database = await initDb();
        await runExecute(
            database,
            "UPDATE products SET name = $1, nameAr = $2, category = $3, priceSale = $4, priceBuy = $5, stock = $6, unit = $7, barcode = $8, expiryDate = $9, sizeStock = $10 WHERE id = $11",
            [product.name, product.nameAr, product.category, product.priceSale, product.priceBuy, product.stock, product.unit, normalizeBarcode(product.barcode) || null, product.expiryDate || null, product.sizeStock ? JSON.stringify(product.sizeStock) : null, product.id]
        );

    } catch (error) {
        console.error("error updating product", error);
        throw error;
    }
}

export async function deleteProduct(id: string) {
    try {
        const database = await initDb();
        await database.execute("DELETE FROM products WHERE id = $1", [id]);
    } catch (error) {
        console.error("error deleting product", error);
        throw error;
    }
}

// Clients
export async function getClients(): Promise<Client[]> {
    try {
        const database = await initDb();
        return await runSelect<Client[]>(database, "SELECT * FROM clients ORDER BY name ASC");
    } catch (error) {
        console.error("error getting clients", error);
        return [];
    }
}

export async function saveClients(clients: Client[]) {
    try {
        const database = await initDb();
        await upsertClients(database, clients);
    } catch (error) {
        console.error("error saving clients", error);
        throw error;
    }
}

export async function updateClientCredit(clientId: string, amount: number) {
    try {
        const database = await initDb();
        await database.execute("UPDATE clients SET balance = balance + $1 WHERE id = $2", [amount, clientId]);
    } catch (error) {
        console.error("error updating client credit", error);
        throw error;
    }
}

export async function updateClient(client: Client) {
    try {
        const database = await initDb();
        await runExecute(
            database,
            "UPDATE clients SET name = $1, phone = $2, balance = $3 WHERE id = $4",
            [client.name, client.phone, client.balance, client.id]
        );
    } catch (error) {
        console.error("error updating client", error);
        throw error;
    }
}

export async function deleteClient(id: string) {
    try {
        const database = await initDb();
        await database.execute("DELETE FROM clients WHERE id = $1", [id]);
    } catch (error) {
        console.error("error deleting client", error);
        throw error;
    }
}

// Sales
export async function getSales(monthPrefix?: string): Promise<Sale[]> {
    try {
        const database = await initDb();
        let query = "SELECT * FROM sales ORDER BY date DESC";
        let params: any[] = [];
        if (monthPrefix) {
            query = "SELECT * FROM sales WHERE date LIKE $1 ORDER BY date DESC";
            params = [monthPrefix + '%'];
        }
        const rows = await runSelect<RawSaleRow[]>(database, query, params);
        return rows.filter(row => (row as RawInvoiceRow & { status?: string }).status !== "draft").map((row) => ({
            ...row,
            items: JSON.parse(row.items),
        } as Sale));
    } catch (error) {
        console.error("error getting sales", error);
        return [];
    }
}

export async function getNextTicketId(): Promise<string> {
    try {
        const database = await initDb();
        const rows = await runSelect<{ id: string }[]>(database, "SELECT id FROM sales WHERE id GLOB '[0-9]*' ORDER BY CAST(id AS INTEGER) DESC LIMIT 1");
        if (rows.length > 0) {
            const lastId = parseInt(rows[0].id);
            return (lastId + 1).toString().padStart(4, '0');
        }
        return "0001";
    } catch (error) {
        console.error("error getting next ticket id", error);
        return "0001";
    }
}

export async function addSale(sale: Sale) {
    try {
        const database = await initDb();
        await runExecute(
            database,
            "INSERT OR REPLACE INTO sales (id, type, items, reduction, total, paidAmount, creditAmount, clientId, date, username, originalSaleId) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
            [
                sale.id, sale.type, JSON.stringify(sale.items),
                sale.reduction, sale.total, sale.paidAmount,
                sale.creditAmount, sale.clientId || null, sale.date, sale.username || null,
                sale.originalSaleId || null
            ]
        );
    } catch (error) {
        console.error("error adding sale", error);
        throw error;
    }
}

export async function deleteSale(id: string) {
    try {
        const database = await initDb();
        await database.execute("DELETE FROM sales WHERE id = $1", [id]);
    } catch (error) {
        console.error("error deleting sale", error);
        throw error;
    }
}

export async function getSalesByClient(clientId: string): Promise<Sale[]> {
    try {
        const database = await initDb();
        const rows = await runSelect<RawSaleRow[]>(database, "SELECT * FROM sales WHERE clientId = $1 ORDER BY date DESC", [clientId]);
        return rows.map((row) => ({
            ...row,
            items: JSON.parse(row.items),
        } as Sale));
    } catch (error) {
        console.error("error getting sales by client", error);
        return [];
    }
}

// Suppliers
export async function getSuppliers(): Promise<Supplier[]> {
    try {
        const database = await initDb();
        return await runSelect<Supplier[]>(database, "SELECT * FROM suppliers ORDER BY name ASC");
    } catch (error) {
        console.error("error getting suppliers", error);
        return [];
    }
}

export async function saveSuppliers(suppliers: Supplier[]) {
    try {
        const database = await initDb();
        await upsertSuppliers(database, suppliers);
    } catch (error) {
        console.error("error saving suppliers", error);
        throw error;
    }
}

export async function addSupplier(supplier: Supplier) {
    try {
        const database = await initDb();
        await runExecute(
            database,
            "INSERT OR REPLACE INTO suppliers (id, name, phone, address) VALUES ($1, $2, $3, $4)",
            [supplier.id, supplier.name, supplier.phone, supplier.address]
        );
    } catch (error) {
        console.error("error adding supplier", error);
        throw error;
    }
}

export async function updateSupplier(supplier: Supplier) {
    try {
        const database = await initDb();
        await runExecute(
            database,
            "UPDATE suppliers SET name = $1, phone = $2, address = $3 WHERE id = $4",
            [supplier.name, supplier.phone, supplier.address, supplier.id]
        );
    } catch (error) {
        console.error("error updating supplier", error);
        throw error;
    }
}

export async function deleteSupplier(id: string) {
    try {
        const database = await initDb();
        await database.execute("DELETE FROM suppliers WHERE id = $1", [id]);
    } catch (error) {
        console.error("error deleting supplier", error);
        throw error;
    }
}

// Invoices
export async function getInvoices(): Promise<Invoice[]> {
    try {
        const database = await initDb();
        const rows = await runSelect<RawInvoiceRow[]>(database, "SELECT * FROM invoices ORDER BY date DESC");
        return rows.map((row) => ({
            ...row,
            supplier: JSON.parse(row.supplier),
            items: JSON.parse(row.items),
        } as Invoice));
    } catch (error) {
        console.error("error getting invoices", error);
        return [];
    }
}

export async function saveInvoices(invoices: Invoice[]) {
    try {
        const database = await initDb();
        await upsertInvoices(database, invoices);
    } catch (error) {
        console.error("error saving invoices", error);
        throw error;
    }
}

export async function addInvoice(invoice: Invoice) {
    try {
        const database = await initDb();
        await runExecute(
            database,
            "INSERT OR REPLACE INTO invoices (id, number, supplier, items, total, date, type, addedBy, editedBy) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
            [invoice.id, invoice.number, JSON.stringify(invoice.supplier), JSON.stringify(invoice.items), invoice.total, invoice.date, invoice.type, invoice.addedBy || null, invoice.editedBy || null]
        );
    } catch (error) {
        console.error("error adding invoice", error);
        if (error instanceof Error) throw error;
        throw new Error(`Erreur SQL addInvoice: ${JSON.stringify(error)}`);
    }
}

export async function deleteInvoice(id: string) {
    try {
        const database = await initDb();
        await database.execute("DELETE FROM invoices WHERE id = $1", [id]);
    } catch (error) {
        console.error("error deleting invoice", error);
        throw error;
    }
}

// Payments
export async function getPayments(monthPrefix?: string): Promise<Payment[]> {
    try {
        const database = await initDb();
        let query = "SELECT * FROM payments ORDER BY date DESC";
        let params: any[] = [];
        if (monthPrefix) {
            query = "SELECT * FROM payments WHERE date LIKE $1 ORDER BY date DESC";
            params = [monthPrefix + '%'];
        }
        return await runSelect<Payment[]>(database, query, params);
    } catch (error) {
        console.error("error getting payments", error);
        return [];
    }
}

export async function getPaymentsByClient(clientId: string): Promise<Payment[]> {
    try {
        const database = await initDb();
        return await runSelect<Payment[]>(database, "SELECT * FROM payments WHERE clientId = $1 ORDER BY date DESC", [clientId]);
    } catch (error) {
        console.error("error getting payments by client", error);
        return [];
    }
}

export async function addPayment(payment: Payment) {
    try {
        const database = await initDb();
        await runExecute(
            database,
            "INSERT OR REPLACE INTO payments (id, clientId, amount, date, note, addedBy) VALUES ($1, $2, $3, $4, $5, $6)",
            [payment.id, payment.clientId, payment.amount, payment.date, payment.note || null, payment.addedBy || null]
        );

        await updateClientCredit(payment.clientId, -payment.amount);
    } catch (error) {
        console.error("error adding payment", error);
        throw error;
    }
}

export async function deletePayment(id: string) {
    try {
        const database = await initDb();
        const payment = (await runSelect<Payment[]>(database, "SELECT * FROM payments WHERE id = $1", [id]))[0];
        if (payment) {
            await database.execute("DELETE FROM payments WHERE id = $1", [id]);
            await updateClientCredit(payment.clientId, payment.amount);
        }
    } catch (error) {
        console.error("error deleting payment", error);
        throw error;
    }
}

// Expenses
export async function getExpenses(monthPrefix?: string): Promise<Expense[]> {
    try {
        const database = await initDb();
        let query = "SELECT * FROM expenses ORDER BY date DESC";
        let params: any[] = [];
        if (monthPrefix) {
            query = "SELECT * FROM expenses WHERE date LIKE $1 ORDER BY date DESC";
            params = [monthPrefix + '%'];
        }
        return await runSelect<Expense[]>(database, query, params);
    } catch (error) {
        console.error("error getting expenses", error);
        return [];
    }
}

export async function addExpense(expense: Expense) {
    try {
        const database = await initDb();
        await runExecute(
            database,
            "INSERT OR REPLACE INTO expenses (id, amount, date, note) VALUES ($1, $2, $3, $4)",
            [expense.id, expense.amount, expense.date, expense.note]
        );
    } catch (error) {
        console.error("error adding expense", error);
        throw error;
    }
}

export async function deleteExpense(id: string) {
    try {
        const database = await initDb();
        await database.execute("DELETE FROM expenses WHERE id = $1", [id]);
    } catch (error) {
        console.error("error deleting expense", error);
        throw error;
    }
}

// Custom Cards
export async function getCustomCards(): Promise<CustomSaleCard[]> {
    try {
        const database = await initDb();
        return await runSelect<CustomSaleCard[]>(database, "SELECT * FROM custom_cards");
    } catch (error) {
        console.error("error getting custom cards", error);
        return [];
    }
}

export async function saveCustomCards(cards: CustomSaleCard[]) {
    try {
        const database = await initDb();
        await replaceCustomCards(database, cards);
    } catch (error) {
        console.error("error saving custom cards", error);
        throw error;
    }
}
// Users
export async function getUsers(): Promise<User[]> {
    try {
        const database = await initDb();
        return await runSelect<User[]>(database, "SELECT * FROM users ORDER BY username ASC");
    } catch (error) {
        console.error("error getting users", error);
        return [];
    }
}

export async function addUser(user: User) {
    try {
        const database = await initDb();
        await runExecute(
            database,
            "INSERT INTO users (id, username, password, role, status) VALUES ($1, $2, $3, $4, $5)",
            [user.id, user.username, user.password, user.role, user.status]
        );
    } catch (error) {
        console.error("error adding user", error);
        throw error;
    }
}

export async function updateUserStatus(id: string, status: "active" | "inactive") {
    try {
        const database = await initDb();
        await database.execute("UPDATE users SET status = $1 WHERE id = $2", [status, id]);
    } catch (error) {
        console.error("error updating user status", error);
        throw error;
    }
}

export async function updateUser(user: User) {
    try {
        const database = await initDb();
        await runExecute(
            database,
            "UPDATE users SET username = $1, password = $2, role = $3, status = $4 WHERE id = $5",
            [user.username, user.password, user.role, user.status, user.id]
        );
    } catch (error) {
        console.error("error updating user", error);
        throw error;
    }
}

export async function deleteUser(id: string) {
    try {
        const database = await initDb();
        await database.execute("DELETE FROM users WHERE id = $1", [id]);
    } catch (error) {
        console.error("error deleting user", error);
        throw error;
    }
}

// Categories
export async function getCategories(): Promise<Category[]> {
    try {
        const database = await initDb();
        const rows = await runSelect<any[]>(database, "SELECT * FROM categories ORDER BY sortOrder ASC");
        return rows.map(r => ({
            ...r,
            hasVentePersonnalisee: !!r.hasVentePersonnalisee,
            hasTailles: !!r.hasTailles,
            hasPointure: !!r.hasPointure,
        }));
    } catch (error) {
        console.error("error getting categories", error);
        return DEFAULT_CATEGORIES;
    }
}

export async function addCategory(category: Category) {
    try {
        const database = await initDb();
        await runExecute(
            database,
            "INSERT INTO categories (id, key, label, labelAr, color, hoverColor, icon, customIcon, hasVentePersonnalisee, hasTailles, hasPointure, sortOrder) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
            [category.id, category.key, category.label, category.labelAr, category.color, category.hoverColor, category.icon, category.customIcon || null, category.hasVentePersonnalisee ? 1 : 0, category.hasTailles ? 1 : 0, category.hasPointure ? 1 : 0, category.sortOrder]
        );
    } catch (error) {
        console.error("error adding category", error);
        throw error;
    }
}

export async function updateCategory(category: Category) {
    try {
        const database = await initDb();
        await runExecute(
            database,
            "UPDATE categories SET key = $1, label = $2, labelAr = $3, color = $4, hoverColor = $5, icon = $6, customIcon = $7, hasVentePersonnalisee = $8, hasTailles = $9, hasPointure = $10, sortOrder = $11 WHERE id = $12",
            [category.key, category.label, category.labelAr, category.color, category.hoverColor, category.icon, category.customIcon || null, category.hasVentePersonnalisee ? 1 : 0, category.hasTailles ? 1 : 0, category.hasPointure ? 1 : 0, category.sortOrder, category.id]
        );
    } catch (error) {
        console.error("error updating category", error);
        throw error;
    }
}

export async function deleteCategory(id: string) {
    try {
        const database = await initDb();
        await database.execute("DELETE FROM categories WHERE id = $1", [id]);
    } catch (error) {
        console.error("error deleting category", error);
        throw error;
    }
}
