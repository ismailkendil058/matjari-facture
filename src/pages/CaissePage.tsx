import { useEffect, useState, useMemo, useCallback, useRef, type MouseEvent as ReactMouseEvent } from "react";
import {
  Search, Plus, Minus, Trash2, Package, Printer, Calendar, Tag, X
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getClients, saveClients, updateClientCredit, addSale, getSales,
  getProducts, updateProductStock, getCustomCards, saveCustomCards,
  addExpense, updateProduct, saveProducts, getNextTicketId, getCategories
} from "@/lib/db";

import { Product, CartItem, CategoryType, CustomSaleCard, Client, Sale, Expense, Category } from "@/lib/types";
import { formatDZD, generateId } from "@/lib/store";
import { findProductByBarcode, normalizeBarcode, generateBarcodeValue } from "@/lib/barcode";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/AuthContext";
import { CATEGORY_ICON_MAP } from "@/lib/icons";

// These files are bundled with the application so invoices do not depend on
// an external QR-code service or an internet connection while printing.
const INVOICE_QR_CODES = {
  instagram: "/qr-instagram.png",
  viber: "/qr-viber.png",
  location: "/qr-location.png",
} as const;

const DEFAULT_INVOICE_NOTE = "Conditions de retour :\nRetours acceptés sous 3 jours avec cette facture.\nالاسترجاع مقبول خلال 3 أيام";

const formatInvoiceNoteForPrint = (note: string) => {
  const trimmedNote = note.trim();
  if (!trimmedNote) return "Aucune condition particulière.";

  return trimmedNote
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r?\n/g, "<br>");
};

// Icon registry for resolving icon names to components
const LUCIDE_ICON_MAP = CATEGORY_ICON_MAP;

const getTodayString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getSaleDateString = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr.slice(0, 10);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"];
const SHOE_SIZES = ["28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47", "48"];

export default function CaissePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryType | null>(null);
  const [barcodeInput, setBarcodeInput] = useState("");
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const [reduction, setReduction] = useState(0);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showReduction, setShowReduction] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [matchingClients, setMatchingClients] = useState<Client[]>([]);
  const [showCreditDetails, setShowCreditDetails] = useState(false);
  const [paidNow, setPaidNow] = useState("");
  const [mobileSection, setMobileSection] = useState<"products" | "cart">("products");
  const [tempReduction, setTempReduction] = useState("");

  const [customCards, setCustomCards] = useState<CustomSaleCard[]>([]);
  const [showCustomModal, setShowCustomModal] = useState(false);

  const [showExpense, setShowExpense] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseNote, setExpenseNote] = useState("");

  // Additional payment (benefit) modal/state
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [addPaymentTitle, setAddPaymentTitle] = useState("");
  const [addPaymentPrice, setAddPaymentPrice] = useState("");

  const [customModalProduct, setCustomModalProduct] = useState<Product | null>(null);
  const [customModalKg, setCustomModalKg] = useState("");
  const [customModalUnitPrice, setCustomModalUnitPrice] = useState("");
  const [activeCustomCard, setActiveCustomCard] = useState<CustomSaleCard | null>(null);
  const [customCardKg, setCustomCardKg] = useState("");

  const [persoQuantityModalProduct, setPersoQuantityModalProduct] = useState<Product | null>(null);
  const [persoQuantityInput, setPersoQuantityInput] = useState("");

  const [showSizeModal, setShowSizeModal] = useState(false);
  const [sizeModalProduct, setSizeModalProduct] = useState<Product | null>(null);
  const sizeModalOpenTimeRef = useRef<number>(0);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [editingClientInModal, setEditingClientInModal] = useState(false);
  const [tempClientName, setTempClientName] = useState("");
  const [invoicePaymentMethod, setInvoicePaymentMethod] = useState<'cash' | 'cheque'>('cash');
  const [editingPaymentInModal, setEditingPaymentInModal] = useState(false);
  const [invoiceNote, setInvoiceNote] = useState(DEFAULT_INVOICE_NOTE);
  const [editingInvoiceNote, setEditingInvoiceNote] = useState(false);

  const [showRetour, setShowRetour] = useState(false);
  const [currentSaleId, setCurrentSaleId] = useState("");
  const [retourProductSearch, setRetourProductSearch] = useState("");
  const [retourDateFilter, setRetourDateFilter] = useState(getTodayString());
  const [selectedSaleForReturn, setSelectedSaleForReturn] = useState<Sale | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [returnReduction, setReturnReduction] = useState<number>(0);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);

  // Dynamic categories from database
  const [dbCategories, setDbCategories] = useState<Category[]>([]);

  const focusBarcodeInput = useCallback(() => {
    barcodeInputRef.current?.focus();
  }, []);

  useEffect(() => {
    focusBarcodeInput();
  }, [focusBarcodeInput, mobileSection]);

  const handleCaisseClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest("button, input, textarea, select, a, [role='dialog']")) return;
    focusBarcodeInput();
  };

  // Derived lookups from dynamic categories
  const categoryColors = useMemo(() => {
    const map: Record<string, string> = {};
    dbCategories.forEach(c => {
      map[c.key] = `bg-[${c.color}] hover:bg-[${c.hoverColor}] text-white`;
    });
    return map;
  }, [dbCategories]);

  const categoryIcons = useMemo(() => {
    const map: Record<string, any> = {};
    dbCategories.forEach(c => {
      map[c.key] = LUCIDE_ICON_MAP[c.icon] || Package;
    });
    return map;
  }, [dbCategories]);

  const SIZE_CATEGORIES = useMemo(() => {
    return dbCategories.filter(c => c.hasTailles || c.hasPointure).map(c => c.key);
  }, [dbCategories]);

  const customizableCategories = useMemo(() => {
    return new Set(dbCategories.filter(c => c.hasVentePersonnalisee).map(c => c.key));
  }, [dbCategories]);

  const dynamicCATEGORIES = useMemo(() => {
    return dbCategories.map(c => ({ key: c.key, label: c.label, labelAr: c.labelAr }));
  }, [dbCategories]);

  // Helper: is this a pointure (shoe) category?
  const isPointureCategory = useCallback((catKey: string) => {
    return dbCategories.some(c => c.key === catKey && c.hasPointure);
  }, [dbCategories]);

  // Helper: get custom icon data URI if available
  const getCategoryCustomIcon = useCallback((catKey: string) => {
    return dbCategories.find(c => c.key === catKey)?.customIcon;
  }, [dbCategories]);

  // Helper: get the color style object for inline styling
  const getCategoryColorStyle = useCallback((catKey: string): React.CSSProperties => {
    const cat = dbCategories.find(c => c.key === catKey);
    return cat ? { backgroundColor: cat.color } : {};
  }, [dbCategories]);

  const getCategoryHoverColorStyle = useCallback((catKey: string): React.CSSProperties => {
    const cat = dbCategories.find(c => c.key === catKey);
    return cat ? { backgroundColor: cat.hoverColor } : {};
  }, [dbCategories]);


  const getCustomCardPendingKg = useCallback((cardId: string) => {
    return cart.reduce((sum, item) => {
      if (item.customCardId !== cardId) return sum;
      return sum + (item.weightKg ?? item.quantity);
    }, 0);
  }, [cart]);

  const visibleCustomCards = useMemo(() => {
    const filtered = activeCategory ? customCards.filter(card => card.category === activeCategory) : customCards;
    return filtered.filter(card => card.kg - getCustomCardPendingKg(card.id) > 0);
  }, [customCards, activeCategory, getCustomCardPendingKg]);

  const mobileCartCount = useMemo(() => {
    const total = cart.reduce((sum, item) => sum + (item.weightKg ?? item.quantity), 0);
    return Number.isInteger(total) ? String(total) : total.toFixed(1);
  }, [cart]);

  const sectionOptions = [
    { id: "products", label: "Produits" },
    { id: "cart", label: "Panier" },
  ] as const;

  useEffect(() => {
    const loadData = async () => {
      try {
        const [prods, cards, cls, cats] = await Promise.all([
          getProducts(),
          getCustomCards(),
          getClients(),
          getCategories(),
        ]);
        setProducts(prods);
        setCustomCards(cards);
        setClients(cls);
        setDbCategories(cats);
        // Set default active category to first category
        if (cats.length > 0) {
          setActiveCategory(cats[0].key);
        }
      } catch (error) {
        console.error("Error loading Caisse data:", error);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleInventoryUpdated = async () => {
      const prods = await getProducts();
      setProducts(prods);
    };
    window.addEventListener("novaInventoryUpdated", handleInventoryUpdated);
    return () => window.removeEventListener("novaInventoryUpdated", handleInventoryUpdated);
  }, []);

  const openCustomModal = (product: Product) => {
    if (product.stock <= 0) return;
    setCustomModalProduct(product);
    setCustomModalKg("");
    setCustomModalUnitPrice("");
    setShowCustomModal(true);
  };

  const closeCustomModal = () => {
    setShowCustomModal(false);
    setCustomModalProduct(null);
    setCustomModalKg("");
    setCustomModalUnitPrice("");
  };

  const getCustomPurchaseCostPerKg = (baseProduct: Product, kg: number) => {
    if (kg <= 0) return baseProduct.priceBuy;
    return baseProduct.priceBuy / kg;
  };

  const addCustomCartItem = (
    persoProduct: Product,
    kg: number,
    unitPrice: number,
    customPurchaseCostPerKg: number,
    customCardId?: string
  ) => {
    setCart(prev => {
      const existing = prev.find(c => c.product.id === persoProduct.id);

      if (existing) {
        return prev.map(c =>
          c.product.id === existing.product.id
            ? { ...c, quantity: c.quantity + kg, weightKg: (c.weightKg ?? c.quantity) + kg, subtotal: (c.quantity + kg) * unitPrice }
            : c
        );
      }

      const newItem: CartItem = {
        product: persoProduct,
        quantity: kg,
        subtotal: kg * unitPrice,
        weightKg: kg,
        customUnitPrice: unitPrice,
        customUnitCost: customPurchaseCostPerKg,
        customCardId,
      };

      return [...prev, newItem];
    });
  };

  const addCustomCardEntry = async (baseProduct: Product, kg: number, unitPrice: number, priceBuyPerKg: number) => {
    const card: CustomSaleCard = {
      id: `${baseProduct.id}-custom-card-${Date.now()}`,
      baseProductId: baseProduct.id,
      baseProductName: baseProduct.name,
      category: baseProduct.category,
      kg,
      unitPrice,
      priceBuyPerKg,
    };

    const nextCards = [...customCards, card];
    await saveCustomCards(nextCards);
    setCustomCards(nextCards);
  };

  const handleCustomSaleConfirm = async () => {
    if (!customModalProduct) return;
    const kg = Number(customModalKg);
    const unitPrice = Number(customModalUnitPrice);
    if (!kg || !unitPrice || customModalProduct.stock <= 0) return;
    const customPurchaseCostPerKg = getCustomPurchaseCostPerKg(customModalProduct, kg);

    try {
      // 1. Subtract 1 from base product stock immediately in DB
      await updateProductStock(customModalProduct.id, -1);

      // 2. Derive independent product name e.g. "Marlboro Perso"
      const baseName = customModalProduct.name.trim();
      const persoName = baseName.toLowerCase().endsWith("perso") ? baseName : `${baseName} Perso`;

      // 3. Check if independent product already exists in DB
      const currentProds = await getProducts();
      const existingPerso = currentProds.find(
        p => p.name.toLowerCase() === persoName.toLowerCase() && p.category === customModalProduct.category
      );

      let targetPersoProduct: Product;
      if (existingPerso) {
        targetPersoProduct = {
          ...existingPerso,
          stock: existingPerso.stock + kg,
          priceSale: unitPrice,
          priceBuy: customPurchaseCostPerKg,
        };
        await updateProduct(targetPersoProduct);
      } else {
        targetPersoProduct = {
          id: `perso-${customModalProduct.id}-${Date.now()}`,
          name: persoName,
          nameAr: customModalProduct.nameAr ? `${customModalProduct.nameAr} (مخصص)` : undefined,
          category: customModalProduct.category,
          priceSale: unitPrice,
          priceBuy: customPurchaseCostPerKg,
          stock: kg,
          unit: customModalProduct.unit || "pièce",
          barcode: generateBarcodeValue(persoName),
        };
        await saveProducts([targetPersoProduct]);
      }

      // 4. Create the custom card (synced for UI)
      await addCustomCardEntry(customModalProduct, kg, unitPrice, customPurchaseCostPerKg);

      // 5. Refresh products from DB so UI & Inventaire update instantly
      const refreshedProds = await getProducts();
      setProducts(refreshedProds);

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("novaInventoryUpdated"));
      }

      closeCustomModal();
      toast({
        title: "Produit personnalisé créé",
        description: `Produit "${persoName}" disponible dans l'inventaire (${kg} unités).`
      });
    } catch (error) {
      console.error("Error saving custom product:", error);
      toast({ title: "Erreur", description: "Échec de création du produit personnalisé." });
    }
  };

  const canUseCustomCard = (card: CustomSaleCard) => {
    const available = card.kg - getCustomCardPendingKg(card.id);
    return available > 0;
  };

  const openCustomCardModal = (card: CustomSaleCard) => {
    if (!canUseCustomCard(card)) return;
    setActiveCustomCard(card);
    setCustomCardKg("");
  };

  const handleCustomCardAdd = (card: CustomSaleCard, kgOverride?: number) => {
    const kg = kgOverride ?? 1;
    if (kg <= 0) return;

    const baseName = card.baseProductName.trim();
    const persoName = baseName.toLowerCase().endsWith("perso") ? baseName : `${baseName} Perso`;

    const baseProduct = products.find(p => p.id === card.baseProductId);
    const persoProduct = products.find(
      p => p.name.toLowerCase() === persoName.toLowerCase() && p.category === card.category
    ) || baseProduct;

    if (!persoProduct) return;

    const pendingInCart = getCustomCardPendingKg(card.id);
    if (kg > card.kg - pendingInCart) return;

    const customPurchaseCostPerKg = card.priceBuyPerKg ?? (baseProduct ? getCustomPurchaseCostPerKg(baseProduct, card.kg) : card.unitPrice);
    addCustomCartItem(persoProduct, kg, card.unitPrice, customPurchaseCostPerKg, card.id);

    if (!kgOverride) {
      setActiveCustomCard(null);
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
      const matchCat = !search && activeCategory ? p.category === activeCategory : true;
      return matchSearch && matchCat;
    });
  }, [products, search, activeCategory]);

  const addToCart = useCallback((product: Product, size?: string) => {
    // Total qty of this product in cart regardless of size (to check stock)
    const totalQtyInCart = cart.reduce((sum, item) => {
      return item.product.id === product.id ? sum + item.quantity : sum;
    }, 0);

    if (product.stock <= totalQtyInCart) return false;

    // Size-specific stock check
    if (size) {
      const available = product.sizeStock?.[size] || 0;
      const inCart = cart.find(c => c.product.id === product.id && !c.customUnitPrice)?.sizeQtys?.[size] || 0;
      if (available <= inCart) return false;
    }


    setCart(prev => {
      const existing = prev.find(c => c.product.id === product.id && !c.customUnitPrice);
      if (existing) {
        const nextSizeQtys = { ...(existing.sizeQtys || {}) };
        if (size) nextSizeQtys[size] = (nextSizeQtys[size] || 0) + 1;

        return prev.map(c => (c.product.id === product.id && !c.customUnitPrice)
          ? {
            ...c,
            quantity: c.quantity + 1,
            subtotal: (c.quantity + 1) * product.priceSale,
            size: size ? (c.size ? (c.size.split(', ').includes(size) ? c.size : `${c.size}, ${size}`) : size) : c.size,
            sizeQtys: nextSizeQtys
          }
          : c
        );
      }
      return [...prev, { product, quantity: 1, size, subtotal: product.priceSale, sizeQtys: size ? { [size]: 1 } : undefined }];
    });
    return true;
  }, [cart]);

  const productHasSizes = useCallback((product: Product) => {
    if (SIZE_CATEGORIES.includes(product.category)) return true;
    if (product.sizeStock && Object.keys(product.sizeStock).length > 0) return true;
    return false;
  }, [SIZE_CATEGORIES]);

  const isPersoProduct = useCallback((product: Product) => {
    return product.name.toLowerCase().includes("perso") || product.id.startsWith("perso-");
  }, []);

  const handleProductClick = (product: Product) => {
    if (isPersoProduct(product)) {
      setPersoQuantityModalProduct(product);
      setPersoQuantityInput("");
      return;
    }

    if (productHasSizes(product)) {
      sizeModalOpenTimeRef.current = Date.now();
      setSizeModalProduct(product);
      setShowSizeModal(true);
    } else {
      addToCart(product);
    }
  };

  const handlePersoQuantityConfirm = () => {
    if (!persoQuantityModalProduct) return;
    const qty = Number(persoQuantityInput);
    if (!qty || qty <= 0) return;

    const inCart = cart.reduce((sum, item) => item.product.id === persoQuantityModalProduct.id ? sum + item.quantity : sum, 0);
    if (persoQuantityModalProduct.stock < inCart + qty) {
      toast({ title: "Stock insuffisant", description: `Seulement ${persoQuantityModalProduct.stock} unités disponibles pour ${persoQuantityModalProduct.name}.` });
      return;
    }

    addCustomCartItem(
      persoQuantityModalProduct,
      qty,
      persoQuantityModalProduct.priceSale,
      persoQuantityModalProduct.priceBuy
    );

    toast({
      title: "Ajouté au panier",
      description: `${qty} x ${persoQuantityModalProduct.name} ajouté(s).`
    });

    setPersoQuantityModalProduct(null);
    setPersoQuantityInput("");
  };

  const selectSize = (size: string) => {
    // Prevent barcode scanner 'Enter' key leak from immediately triggering first size button
    if (Date.now() - sizeModalOpenTimeRef.current < 250) {
      return;
    }
    if (sizeModalProduct) {
      const added = addToCart(sizeModalProduct, size);
      if (!added) {
        toast({ title: "Stock insuffisant", description: `${sizeModalProduct.name} n'est pas disponible en quantité suffisante en taille ${size}.` });
      } else {
        toast({ title: "Ajouté au panier", description: `${sizeModalProduct.name} (${size}) ajouté.` });
      }
      setShowSizeModal(false);
      setSizeModalProduct(null);
    }
  };

  const handleAddByBarcode = async (code?: string) => {
    const val = normalizeBarcode(code ?? barcodeInput);
    if (!val) return;
    setBarcodeInput("");

    let found = findProductByBarcode(products, val);
    if (!found) {
      const latestProducts = await getProducts();
      setProducts(latestProducts);
      found = findProductByBarcode(latestProducts, val);
    }
    if (!found) {
      toast({ title: "Produit non trouvé", description: "Aucun produit avec ce code-barre." });
      return;
    }

    if (productHasSizes(found)) {
      sizeModalOpenTimeRef.current = Date.now();
      setSizeModalProduct(found);
      setShowSizeModal(true);
      return;
    }

    const added = addToCart(found);
    if (!added) {
      toast({ title: "Stock insuffisant", description: `${found.name} n'est pas disponible en quantité suffisante.` });
      return;
    }

    toast({ title: "Ajouté au panier", description: `${found.name} ajouté.` });
  };

  const updateQty = (id: string, delta: number) => {
    setCart(prev => {
      const item = prev.find(c => c.product.id === id);

      if (!item) return prev;

      if (delta > 0) {
        if (item.customCardId) {
          const card = customCards.find(c => c.id === item.customCardId);
          if (card) {
            const pending = prev.reduce((sum, c) => {
              if (c.customCardId !== card.id) return sum;
              return sum + (c.weightKg ?? c.quantity);
            }, 0);
            if (pending >= card.kg) return prev;
          }
        } else {
          const targetProd = products.find(p => p.id === item.product.id);
          if (!targetProd) return prev;

          const totalInCart = prev.reduce((sum, c) => {
            return c.product.id === item.product.id ? sum + c.quantity : sum;
          }, 0);

          if (totalInCart >= targetProd.stock) return prev;
        }
      }

      return prev.map(c => {
        if (c.product.id !== id) return c;
        const newQty = Math.max(0, c.quantity + delta);
        const price = c.customUnitPrice ?? c.product.priceSale;
        return {
          ...c,
          quantity: newQty,
          weightKg: c.weightKg !== undefined ? newQty : undefined,
          subtotal: newQty * price
        };
      }).filter(c => c.quantity > 0);
    });
  };

  const removeItem = (id: string) => setCart(prev => prev.filter(c => c.product.id !== id));

  const handleAddAdditionalPayment = () => {
    setAddPaymentTitle("");
    setAddPaymentPrice("");
    setShowAddPaymentModal(true);
  };

  const confirmAddAdditionalPayment = () => {
    const price = Number(addPaymentPrice) || 0;
    if (!addPaymentTitle || price <= 0) return;

    const prodId = `addpay-${Date.now()}`;
    const newProduct = {
      id: prodId,
      name: addPaymentTitle,
      nameAr: addPaymentTitle,
      category: "addition",
      priceSale: price,
      priceBuy: 0,
      stock: 1,
      unit: "unité" as "unité" | "kg",
    };

    const newItem = {
      product: newProduct,
      quantity: 1,
      subtotal: price,
    };

    setCart(prev => [...prev, newItem]);
    setShowAddPaymentModal(false);
    setAddPaymentTitle("");
    setAddPaymentPrice("");
  };



  const subtotal = cart.reduce((s, c) => s + c.subtotal, 0);
  const total = subtotal - reduction;

  const applyCustomCardUsage = async () => {
    const usage: Record<string, number> = {};
    cart.forEach(item => {
      if (!item.customCardId) return;
      usage[item.customCardId] = (usage[item.customCardId] || 0) + (item.weightKg ?? item.quantity);
    });
    if (!Object.keys(usage).length) return;

    const nextCards = customCards.reduce<CustomSaleCard[]>((acc, card) => {
      const used = usage[card.id] ?? 0;
      const remaining = Math.max(0, card.kg - used);
      if (remaining > 0) {
        return [...acc, { ...card, kg: remaining }];
      }
      return acc;
    }, []);

    await saveCustomCards(nextCards);
    setCustomCards(nextCards);
  };

  const handleCheckout = async (type: 'direct' | 'credit', actualPaid?: number) => {
    try {
      const saleId = currentSaleId || generateId();
      for (const item of cart) {
        const prod = products.find(p => p.id === item.product.id);
        if (prod) {
          const nextSizeStock = { ...(prod.sizeStock || {}) };
          if (item.sizeQtys) {
            Object.entries(item.sizeQtys).forEach(([sz, q]) => {
              nextSizeStock[sz] = Math.max(0, (nextSizeStock[sz] || 0) - q);
            });
          }
          await updateProduct({ ...prod, stock: prod.stock - item.quantity, sizeStock: nextSizeStock });
        }
      }

      await applyCustomCardUsage();

      const isCredit = type === 'credit';
      const finalPaid = actualPaid ?? total;
      const creditAmount = isCredit ? Math.max(0, total - finalPaid) : 0;

      if (type === 'direct') {
        await addSale({
          id: saleId, type: 'direct', items: [...cart], reduction, total,
          paidAmount: total, creditAmount: 0, date: new Date().toISOString(),
          username: user?.username
        } as Sale);
      } else {
        let finalClientId = "";
        const existingClient = clients.find(c => c.name.toLowerCase() === clientName.toLowerCase());
        if (existingClient) {
          finalClientId = existingClient.id;
          await updateClientCredit(existingClient.id, creditAmount);
        } else {
          const newClient: Client = { id: generateId(), name: clientName, phone: clientPhone, balance: creditAmount };
          await saveClients([...clients, newClient]);
          finalClientId = newClient.id;
        }

        await addSale({
          id: saleId, type: 'credit', items: [...cart], reduction, total,
          paidAmount: finalPaid, creditAmount, clientId: finalClientId, date: new Date().toISOString(),
          username: user?.username
        } as Sale);
      }

      setCart([]);
      setReduction(0);
      setClientName("");
      setClientPhone("");
      setPaidNow("");
      setShowCreditDetails(false);
      const prods = await getProducts();
      setProducts(prods);
      setShowCheckout(false);
    } catch (error) {
      console.error("Checkout failed:", error);
    }
  };

  const openCheckout = async () => {
    const nextId = await getNextTicketId();
    setCurrentSaleId(nextId);
    setInvoiceNote(DEFAULT_INVOICE_NOTE);
    setEditingInvoiceNote(false);
    setShowCheckout(true);
  };

  const handleExpenseSubmit = async () => {
    const amt = Number(expenseAmount);
    if (!amt || !expenseNote) return;
    try {
      await addExpense({
        id: generateId(),
        amount: amt,
        date: new Date().toISOString(),
        note: expenseNote
      });
      setShowExpense(false);
      setExpenseAmount("");
      setExpenseNote("");
      toast({ title: "Dépense ajoutée", description: `Dépense de ${formatDZD(amt)} enregistrée.` });
    } catch (error) {
      console.error("Failed to add expense:", error);
    }
  };

  const fetchRecentSales = async () => {
    try {
      const sales = await getSales();
      setRecentSales(sales);
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenRetour = () => {
    setRetourProductSearch("");
    setRetourDateFilter(getTodayString());
    setSelectedSaleForReturn(null);
    setReturnQtys({});
    setReturnReduction(0);
    fetchRecentSales();
    setShowRetour(true);
  };

  // Compute how many units of each item (by item index) have already been returned
  // for a given sale, by looking at all return sales with originalSaleId matching.
  const getAlreadyReturnedQtys = (sale: Sale): Record<string, number> => {
    const returned: Record<string, number> = {};
    const returnSales = recentSales.filter(
      s => s.type === 'return' && s.originalSaleId === sale.id
    );
    // Build a map: for each original item index, total qty already returned
    sale.items.forEach((item, idx) => {
      const key = `${item.product.id}-${idx}`;
      let totalReturned = 0;
      returnSales.forEach(rs => {
        rs.items.forEach(ri => {
          // Match by product id (returned items carry the same product id)
          if (ri.product.id === item.product.id) {
            totalReturned += ri.quantity;
          }
        });
      });
      returned[key] = totalReturned;
    });
    return returned;
  };

  const computeSuggestedReduction = (sale: Sale, currentQtys: Record<string, number>) => {
    if (!sale.reduction || sale.reduction <= 0) return 0;

    const originalSubtotal = sale.items.reduce((sum, item) => {
      const price = item.customUnitPrice ?? item.product.priceSale;
      return sum + (price * item.quantity);
    }, 0);

    if (originalSubtotal <= 0) return 0;

    const returnedSubtotal = sale.items.reduce((sum, item, idx) => {
      const key = `${item.product.id}-${idx}`;
      const qty = currentQtys[key] || 0;
      const price = item.customUnitPrice ?? item.product.priceSale;
      return sum + (price * qty);
    }, 0);

    const ratio = returnedSubtotal / originalSubtotal;
    return Math.round(ratio * sale.reduction);
  };

  const selectSaleForReturn = (sale: Sale) => {
    setSelectedSaleForReturn(sale);
    const alreadyReturned = getAlreadyReturnedQtys(sale);
    const qtys: Record<string, number> = {};
    sale.items.forEach((item, idx) => {
      const key = `${item.product.id}-${idx}`;
      const alreadyReturnedQty = alreadyReturned[key] || 0;
      const maxReturnable = Math.max(0, item.quantity - alreadyReturnedQty);
      qtys[key] = maxReturnable;
    });
    setReturnQtys(qtys);
    setReturnReduction(computeSuggestedReduction(sale, qtys));
  };

  const updateReturnQty = (key: string, newQty: number) => {
    setReturnQtys(prev => {
      const next = { ...prev, [key]: newQty };
      if (selectedSaleForReturn) {
        setReturnReduction(computeSuggestedReduction(selectedSaleForReturn, next));
      }
      return next;
    });
  };

  const handleReturnSubmit = async () => {
    if (!selectedSaleForReturn) return;

    // Compute already-returned quantities to enforce caps
    const alreadyReturned = getAlreadyReturnedQtys(selectedSaleForReturn);

    try {
      let rawRefundSubtotal = 0;
      const returnedItems: CartItem[] = [];

      for (let i = 0; i < selectedSaleForReturn.items.length; i++) {
        const item = selectedSaleForReturn.items[i];
        const key = `${item.product.id}-${i}`;
        const alreadyReturnedQty = alreadyReturned[key] || 0;
        const maxReturnable = Math.max(0, item.quantity - alreadyReturnedQty);
        // Clamp the requested qty to the truly returnable amount
        const qtyToReturn = Math.min(returnQtys[key] || 0, maxReturnable);
        if (qtyToReturn <= 0) continue;

        const subtotal = qtyToReturn * (item.customUnitPrice ?? item.product.priceSale);
        rawRefundSubtotal += subtotal;

        returnedItems.push({
          ...item,
          quantity: qtyToReturn,
          subtotal: subtotal
        });

        // Restore stock
        const prod = products.find(p => p.id === item.product.id);
        if (prod) {
          const nextSizeStock = { ...(prod.sizeStock || {}) };
          if (item.size && !item.size.includes(',')) {
            nextSizeStock[item.size] = (nextSizeStock[item.size] || 0) + qtyToReturn;
          }
          await updateProduct({ ...prod, stock: prod.stock + qtyToReturn, sizeStock: nextSizeStock });
        }
      }

      if (returnedItems.length === 0) {
        toast({ title: "Aucun produit sélectionné", description: "Veuillez choisir les quantités à retourner." });
        return;
      }

      const appliedReduction = Math.min(rawRefundSubtotal, Math.max(0, returnReduction));
      const finalRefundTotal = Math.max(0, rawRefundSubtotal - appliedReduction);

      // If it was a credit sale, reduce client balance
      if (selectedSaleForReturn.type === 'credit' && selectedSaleForReturn.clientId) {
        await updateClientCredit(selectedSaleForReturn.clientId, -finalRefundTotal);
      }

      // Record the return sale
      await addSale({
        id: generateId(),
        type: 'return',
        items: returnedItems,
        reduction: appliedReduction,
        total: finalRefundTotal,
        paidAmount: selectedSaleForReturn.type === 'direct' ? finalRefundTotal : 0,
        creditAmount: selectedSaleForReturn.type === 'credit' ? finalRefundTotal : 0,
        clientId: selectedSaleForReturn.clientId,
        date: new Date().toISOString(),
        username: user?.username,
        originalSaleId: selectedSaleForReturn.id
      } as Sale);

      toast({ title: "Retour effectué", description: `Le retour d'un montant de ${formatDZD(finalRefundTotal)} a été enregistré.` });

      // Refresh all relevant state
      const [prods, cls, updatedSales] = await Promise.all([getProducts(), getClients(), getSales()]);
      setProducts(prods);
      setClients(cls);
      setRecentSales(updatedSales);

      // Go back to the sale list view
      setSelectedSaleForReturn(null);
      setReturnQtys({});
      setReturnReduction(0);
    } catch (error) {
      console.error("Return failed:", error);
      toast({ title: "Erreur", description: "Le retour a échoué." });
    }
  };

  const handlePrintReceipt = () => {
    setShowReceiptModal(true);
  };

  const executePrint = () => {
    const saleId = currentSaleId || generateId().toUpperCase();

    const isCredit = showCreditDetails;
    const paidAmount = isCredit ? (Number(paidNow) || 0) : total;
    const creditAmount = isCredit ? Math.max(0, total - paidAmount) : 0;
    const invoiceDate = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
    const invoiceDateTime = new Date().toLocaleString('fr-FR');

    const itemsHtml = cart.map((item, idx) => {
      const unitPrice = item.customUnitPrice ?? item.product.priceSale;
      return `
      <tr>
        <td style="padding: 10px 8px; border-bottom: 1px solid #f0f0f0; font-size: 13px;">
          <div style="font-weight: 600; color: #1a1a2e;">${item.product.name}${item.size ? ` <span style="color:#6366f1;font-size:11px;">(${item.size})</span>` : ''}</div>
          ${item.product.nameAr ? `<div style="font-size: 11px; color: #888; direction: rtl;">${item.product.nameAr}</div>` : ''}
        </td>
        <td style="padding: 10px 8px; text-align: center; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #555;">${item.weightKg ?? item.quantity}</td>
        <td style="padding: 10px 8px; text-align: right; border-bottom: 1px solid #f0f0f0; font-size: 13px;">${formatDZD(unitPrice)}</td>
        <td style="padding: 10px 8px; text-align: right; border-bottom: 1px solid #f0f0f0; font-size: 13px; font-weight: 700; color: #1a1a2e;">${formatDZD(item.subtotal)}</td>
      </tr>`;}).join('');

    const invoiceContent = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Facture ${saleId} - BK MODE</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
    @page { size: A4; margin: 15mm 20mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color: #1a1a2e; background: #fff; font-size: 13px; }
    .invoice-wrapper { max-width: 750px; margin: 0 auto; }
    /* Header */
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 24px; border-bottom: 3px solid #1a1a2e; margin-bottom: 32px; }
    .brand-block { }
    .brand-name { font-size: 36px; font-weight: 900; letter-spacing: -1px; color: #1a1a2e; line-height: 1; }
    .brand-tagline { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: #888; margin-top: 4px; }
    .brand-contact { font-size: 11px; color: #666; margin-top: 10px; line-height: 1.7; }
    .invoice-title-block { text-align: right; }
    .invoice-label { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: #888; }
    .invoice-number { font-size: 28px; font-weight: 900; color: #6366f1; margin-top: 4px; letter-spacing: -0.5px; }
    .invoice-date { font-size: 12px; color: #666; margin-top: 6px; }
    /* Meta row */
    .meta-row { display: flex; gap: 24px; margin-bottom: 32px; }
    .meta-box { flex: 1; background: #f8f8ff; border-radius: 12px; padding: 16px 20px; border: 1px solid #e8e8f0; }
    .meta-box-title { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #888; font-weight: 700; margin-bottom: 8px; }
    .meta-box-value { font-size: 13px; font-weight: 600; color: #1a1a2e; line-height: 1.6; }
    .meta-box-value span { color: #6366f1; }
    /* Items table */
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    .items-table thead tr { background: #1a1a2e; }
    .items-table thead th { padding: 12px 8px; text-align: left; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: white; font-weight: 700; }
    .items-table thead th:last-child { text-align: right; }
    .items-table thead th:nth-child(2), .items-table thead th:nth-child(3) { text-align: center; }
    .items-table thead th:nth-child(3) { text-align: right; }
    .items-table tbody tr:nth-child(even) { background: #fafafa; }
    /* Totals */
    .totals-section { display: flex; justify-content: flex-end; margin-bottom: 32px; }
    .totals-box { width: 280px; }
    .totals-row { display: flex; justify-content: space-between; padding: 7px 0; font-size: 13px; border-bottom: 1px solid #f0f0f0; }
    .totals-row.total { border-bottom: none; border-top: 2px solid #1a1a2e; margin-top: 8px; padding-top: 12px; }
    .totals-row.total .label { font-size: 15px; font-weight: 900; }
    .totals-row.total .value { font-size: 22px; font-weight: 900; color: #6366f1; }
    .totals-row .label { color: #666; font-weight: 500; }
    .totals-row .value { font-weight: 700; color: #1a1a2e; }
    .totals-row.reduction .value { color: #ef4444; }
    /* Payment info */
    .payment-section { background: linear-gradient(135deg, #f0f0ff, #e8e8ff); border-radius: 12px; padding: 20px 24px; margin-bottom: 32px; border: 1px solid #c7d2fe; }
    .payment-title { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #6366f1; font-weight: 800; margin-bottom: 14px; }
    .payment-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px; }
    .payment-row .label { color: #555; font-weight: 500; }
    .payment-row .value { font-weight: 700; }
    .payment-row.credit-row { border-top: 1px dashed #a5b4fc; padding-top: 10px; margin-top: 4px; }
    .payment-row.credit-row .value { color: #dc2626; font-size: 16px; font-weight: 900; }
    /* Divider */
    .divider { height: 1px; background: #e8e8f0; margin: 24px 0; }
    /* Footer */
    .footer { display: flex; justify-content: space-between; align-items: flex-end; }
    .footer-terms { font-size: 11px; color: #888; line-height: 1.8; max-width: 320px; }
    .footer-terms strong { color: #555; }
    .footer-arabic { font-size: 12px; color: #888; direction: rtl; text-align: right; }
    .footer-stamp { text-align: right; }
    .footer-stamp-box { border: 2px dashed #ddd; border-radius: 10px; padding: 16px 24px; font-size: 11px; color: #ccc; text-align: center; min-width: 140px; }
    .badge { display: inline-block; background: ${isCredit ? '#fef3c7' : '#d1fae5'}; color: ${isCredit ? '#92400e' : '#065f46'}; font-size: 10px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; padding: 3px 10px; border-radius: 999px; margin-top: 6px; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
<div class="invoice-wrapper">
  <!-- Header -->
  <div class="header">
    <div class="brand-block">
      <div class="brand-name">LUXEDOR_</div>
      <div class="brand-tagline">Meubles &amp; Déco</div>
      <div class="brand-contact">
        Tél: 0549 10 64 78<br>
        Adresse: OuledHeddaj, Boumerdes
      </div>
    </div>
    <div class="invoice-title-block">
      <div class="invoice-label">Facture de vente</div>
      <div class="invoice-number">#${saleId.toUpperCase()}</div>
      <div class="invoice-date">${invoiceDate}</div>
      <div class="invoice-date">Caissier: <strong>${user?.username || 'Admin'}</strong></div>
      <div><span class="badge">${isCredit ? 'CRÉDIT' : 'VENTE DIRECTE'}</span></div>
    </div>
  </div>

  <!-- Meta -->
  <div class="meta-row">
    <div class="meta-box">
      <div class="meta-box-title">Vendu par</div>
      <div class="meta-box-value">
        LUXEDOR_<br>
        <span>${invoiceDateTime}</span>
      </div>
    </div>
    ${clientName ? `<div class="meta-box">
      <div class="meta-box-title">Client</div>
      <div class="meta-box-value">
        <strong>${clientName}</strong>${clientPhone ? `<br>${clientPhone}` : ''}
      </div>
    </div>` : '<div class="meta-box"><div class="meta-box-title">Client</div><div class="meta-box-value" style="color:#bbb;">Client de passage</div></div>'}
    <div class="meta-box">
      <div class="meta-box-title">Paiement</div>
      <div class="meta-box-value">
        ${isCredit ? `Crédit client<br><span>Versé: ${formatDZD(paidAmount)}</span>` : (invoicePaymentMethod === 'cheque' ? 'Paiement par Chèque' : 'Paiement Cash')}
      </div>
    </div>
  </div>

  <!-- Items table -->
  <table class="items-table">
    <thead>
      <tr>
        <th style="width:45%; border-radius:8px 0 0 0;">Désignation</th>
        <th style="width:15%; text-align:center;">Qté</th>
        <th style="width:20%; text-align:right;">Prix Unit.</th>
        <th style="width:20%; text-align:right; border-radius:0 8px 0 0;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>

  <!-- Totals -->
  <div class="totals-section">
    <div class="totals-box">
      <div class="totals-row">
        <span class="label">Sous-total</span>
        <span class="value">${formatDZD(subtotal)}</span>
      </div>
      ${reduction > 0 ? `<div class="totals-row reduction"><span class="label">Remise</span><span class="value">- ${formatDZD(reduction)}</span></div>` : ''}
      <div class="totals-row total">
        <span class="label">Total TTC</span>
        <span class="value">${formatDZD(total)}</span>
      </div>
    </div>
  </div>

  ${isCredit ? `
  <!-- Payment info -->
  <div class="payment-section">
    <div class="payment-title">Détail du paiement crédit</div>
    <div class="payment-row"><span class="label">Montant total</span><span class="value">${formatDZD(total)}</span></div>
    <div class="payment-row"><span class="label">Versement initial</span><span class="value">${formatDZD(paidAmount)}</span></div>
    <div class="payment-row credit-row"><span class="label">Montant restant (crédit)</span><span class="value">${formatDZD(creditAmount)}</span></div>
  </div>` : ''}

  <div class="divider"></div>

  <!-- Footer -->
  <div class="footer">
    <div class="footer-terms">
      <strong>Note / Conditions :</strong><br>
      ${formatInvoiceNoteForPrint(invoiceNote)}
      <br>
      <em style="font-size:10px;">Merci pour votre confiance — LUXEDOR_</em>
    </div>
    <div class="footer-stamp">
      <div class="footer-stamp-box">
        Cachet &amp; Signature
        <br><br><br><br>
      </div>
    </div>
  </div>

  <div class="divider" style="margin: 16px 0 12px;"></div>

  <!-- QR Codes at very bottom of document -->
  <div style="display: flex; justify-content: center; gap: 24px; align-items: center; padding-top: 6px;">
    <!-- Instagram QR -->
    <div style="text-align: center; background: #fafafa; border: 1px solid #eee; padding: 10px 16px; border-radius: 12px;">
      <img src="${INVOICE_QR_CODES.instagram}" alt="Instagram QR" style="width:110px; height:110px; display:block; margin:0 auto 6px;" />
      <div style="font-size:11px; font-weight:800; color:#d62976; display:flex; items-center; justify-content:center; gap:3px;">
        <svg style="width:13px;height:13px;fill:currentColor;" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
        @luxedor_
      </div>
    </div>

    <!-- Viber QR -->
    <div style="text-align: center; background: #fafafa; border: 1px solid #eee; padding: 10px 16px; border-radius: 12px;">
      <img src="${INVOICE_QR_CODES.viber}" alt="Viber QR" style="width:110px; height:110px; display:block; margin:0 auto 6px;" />
      <div style="font-size:11px; font-weight:800; color:#7360f2; display:flex; items-center; justify-center; gap:3px;">
        <svg style="width:13px;height:13px;fill:currentColor;" viewBox="0 0 24 24"><path d="M11.393 0C5.076 0 .004 4.675.004 10.5c0 3.194 1.543 6.044 3.978 7.979v4.208l4.084-2.25c1.077.3 2.22.463 3.327.463 6.317 0 11.393-4.675 11.393-10.5S17.71 0 11.393 0zm4.27 14.544c-.287.458-.87.728-1.54.728-2.613 0-5.321-2.457-6.264-5.352-.164-.505.045-1.076.471-1.353.48-.313 1.133-.186 1.46.287.354.512.784 1.056.963 1.344.153.245.141.564-.031.796-.135.183-.342.434-.486.602-.07.082-.08.2-.023.292.484.773 1.488 1.83 2.302 2.277.097.054.215.04.295-.034.174-.162.437-.417.618-.553.237-.178.56-.176.799-.016.29.195.845.626 1.356.985.474.333.593.993.28 1.462z"/></svg>
        Viber
      </div>
    </div>

    <!-- Maps QR -->
    <div style="text-align: center; background: #fafafa; border: 1px solid #eee; padding: 10px 16px; border-radius: 12px;">
      <img src="${INVOICE_QR_CODES.location}" alt="Maps QR" style="width:110px; height:110px; display:block; margin:0 auto 6px;" />
      <div style="font-size:11px; font-weight:800; color:#ea4335; display:flex; items-center; justify-center; gap:3px;">
        <svg style="width:13px;height:13px;fill:currentColor;" viewBox="0 0 24 24"><path d="M12 0C7.58 0 4 3.58 4 8c0 5.25 8 16 8 16s8-10.75 8-16c0-4.42-3.58-8-8-8zm0 11c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/></svg>
        Localisation
      </div>
    </div>
  </div>
</div>
</body>
</html>`;

    // Create or reuse hidden print iframe
    let printFrame = document.getElementById('a4-print-frame') as HTMLIFrameElement | null;
    if (!printFrame) {
      printFrame = document.createElement('iframe');
      printFrame.id = 'a4-print-frame';
      printFrame.style.position = 'fixed';
      printFrame.style.right = '0';
      printFrame.style.bottom = '0';
      printFrame.style.width = '0';
      printFrame.style.height = '0';
      printFrame.style.border = '0';
      document.body.appendChild(printFrame);
    }

    const frameDoc = printFrame.contentWindow?.document || printFrame.contentDocument;
    if (!frameDoc) {
      window.print();
      setShowReceiptModal(false);
      return;
    }

    frameDoc.open();
    frameDoc.write(invoiceContent);
    frameDoc.close();

    setTimeout(() => {
      try {
        printFrame?.contentWindow?.focus();
        printFrame?.contentWindow?.print();
      } catch (e) {
        console.error("Frame print failed:", e);
        window.print();
      }
      setShowReceiptModal(false);
    }, 300);
  };

  const handleClientInput = (val: string) => {
    setClientName(val);
    if (val.length > 0) {
      setMatchingClients(clients.filter(c => c.name.toLowerCase().includes(val.toLowerCase())));
    } else {
      setMatchingClients([]);
    }
  };

  const selectClient = (client: Client) => {
    setClientName(client.name);
    setClientPhone(client.phone);
    setMatchingClients([]);
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row animate-fade-in bg-secondary font-sans" onClick={handleCaisseClick}>
      <div className="lg:hidden w-full border-b border-border bg-white px-4 pt-4 pb-3 shadow-sm z-10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-foreground">Caisse</h2>
            <p className="text-sm text-muted-foreground">Point de vente</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl border-orange-200 text-orange-600 hover:bg-orange-50 font-bold"
            onClick={handleOpenRetour}
          >
            Retour
          </Button>
        </div>
        <div className="mt-3 flex gap-2">
          {sectionOptions.map(option => (
            <button
              key={option.id}
              type="button"
              onClick={() => setMobileSection(option.id)}
              aria-pressed={mobileSection === option.id}
              className={`flex-1 rounded-2xl border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${mobileSection === option.id ? "bg-primary border-transparent text-white" : "bg-white border-border text-foreground"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {/* Left panel — Products */}
      <div className={`${mobileSection === "cart" ? "hidden" : ""} flex-1 flex flex-col border-b border-border bg-white p-4 lg:flex lg:p-5 lg:border-r lg:border-border lg:bg-white`}>
        <div className="mb-3 hidden items-center justify-between lg:flex">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Caisse</h2>
            <p className="text-sm font-medium text-muted-foreground">Point de vente</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="rounded-xl border-orange-200 text-orange-600 hover:bg-orange-50 font-bold"
              onClick={handleOpenRetour}
            >
              Retour de produit
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6 bg-white rounded-xl shadow-sm border border-border">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground" />
          <Input
            placeholder="Rechercher des produits..."
            className="pl-14 bg-transparent border-0 h-16 text-lg focus-visible:ring-0 shadow-none text-foreground"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Category filters */}
        <div className="w-full overflow-x-auto pb-4 pt-2 flex justify-center scrollbar-thin">
          <div className="flex gap-3 px-1 min-w-max mx-auto justify-center">
            {/* All Category Button */}
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
              className={`shrink-0 w-44 h-36 rounded-3xl transition-all flex flex-col items-center justify-center p-3 shadow-md border border-transparent text-white cursor-pointer select-none ${
                activeCategory === null
                  ? 'bg-slate-800 ring-4 ring-primary scale-95 shadow-xl font-bold'
                  : 'bg-slate-700 hover:-translate-y-1 hover:shadow-lg opacity-90 hover:opacity-100'
              }`}
            >
              <div className="w-16 h-16 flex items-center justify-center mb-2 shrink-0">
                <Package className="w-14 h-14 text-white drop-shadow-md" strokeWidth={1.75} />
              </div>
              <span className="font-black text-base md:text-lg tracking-wider text-center leading-tight line-clamp-1 w-full px-1">
                الكل
              </span>
              <span className="font-bold text-xs opacity-85 tracking-wider text-center uppercase line-clamp-1 w-full px-1">
                Tous
              </span>
            </button>

            {/* Dynamic Category Buttons */}
            {dynamicCATEGORIES.map(cat => {
              const catData = dbCategories.find(c => c.key === cat.key);
              const isActive = activeCategory === cat.key;
              const customIcon = getCategoryCustomIcon(cat.key);
              const IconComp = categoryIcons[cat.key] || Package;

              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setActiveCategory(isActive ? null : cat.key)}
                  className={`shrink-0 w-44 h-36 rounded-3xl transition-all flex flex-col items-center justify-center p-3 shadow-md border border-transparent text-white cursor-pointer select-none ${
                    isActive
                      ? 'ring-4 ring-primary scale-95 shadow-xl font-bold'
                      : 'hover:-translate-y-1 hover:shadow-lg opacity-90 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: catData?.color || '#9DC6D8' }}
                >
                  <div className="w-16 h-16 flex items-center justify-center mb-2 shrink-0">
                    {customIcon ? (
                      <img src={customIcon} alt={cat.label} className="w-14 h-14 object-contain drop-shadow-md" />
                    ) : (
                      <IconComp className="w-14 h-14 text-white drop-shadow-md" strokeWidth={1.75} />
                    )}
                  </div>
                  <span className="font-black text-base md:text-lg tracking-wider text-center leading-tight line-clamp-1 w-full px-1">
                    {cat.labelAr || cat.label}
                  </span>
                  <span className="font-bold text-xs opacity-85 tracking-wider text-center uppercase line-clamp-1 w-full px-1">
                    {cat.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-auto rounded-lg mb-4">
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 md:gap-2.5 p-1">
            {filteredProducts.map(product => {
              const showCustom = customizableCategories.has(product.category) && !isPersoProduct(product);
              return (
                <div
                  key={product.id}
                  onClick={() => handleProductClick(product)}
                  className="bg-white border border-border rounded-xl p-4 text-left hover:border-accent hover:shadow-lg transition-all duration-200 group relative flex flex-col min-h-[220px] items-center justify-between cursor-pointer"
                >

                  <span className="absolute top-3 right-3 text-xs font-bold bg-secondary text-muted-foreground px-2 py-1 rounded-md">
                    {product.stock}
                  </span>
                  {showCustom && (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); openCustomModal(product); }}
                      className="absolute left-3 top-3 h-10 w-10 rounded-full bg-primary text-white flex items-center justify-center shadow-md transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
                      disabled={product.stock <= 0}
                    >
                      <Plus className="h-6 w-6" strokeWidth={2.5} />
                    </button>
                  )}
                  <div className="flex-1 flex items-center justify-center pt-6 pb-2 w-full pointer-events-none">
                    {(() => {
                      const customIcon = getCategoryCustomIcon(product.category);
                      if (customIcon) {
                        return <img src={customIcon} alt="icon" className="h-20 w-20 object-contain drop-shadow-sm group-hover:scale-110 transition-transform opacity-80 group-hover:opacity-100" />;
                      }
                      const ProductIcon = categoryIcons[product.category] || Package;
                      return <ProductIcon className="h-20 w-20 text-muted-foreground group-hover:text-primary group-hover:scale-110 transition-all drop-shadow-sm" strokeWidth={1} />;
                    })()}
                  </div>
                  <div className="w-full border-t border-border pt-3 flex flex-col h-16 justify-end">
                    <p className="text-sm font-bold text-foreground leading-tight mb-2 line-clamp-2 text-center" title={product.name}>{product.name}</p>
                    <p className="text-xl font-black text-primary text-center">{formatDZD(product.priceSale)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>


      </div>

      {/* Right panel — Cart */}
      <div className={`${mobileSection === "products" ? "hidden" : ""} flex w-full flex-col bg-white border-l border-border z-10 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.02)] lg:flex lg:w-[400px] xl:w-[440px] lg:h-screen lg:sticky lg:top-0`}>
        <div className="flex items-center justify-between p-6 border-b border-border bg-white">
          <h3 className="text-2xl font-black tracking-tight text-foreground">Panier</h3>
          <span className="inline-flex h-10 min-w-10 items-center justify-center rounded-full bg-primary px-3 text-lg font-black text-white lg:hidden">
            {mobileCartCount}
          </span>
        </div>

        <div className="p-4 border-b border-border bg-white">
          <Input
            ref={barcodeInputRef}
            placeholder="Scanner / entrer code-barre..."
            value={barcodeInput}
            onChange={e => setBarcodeInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAddByBarcode(e.currentTarget.value);
              }
            }}
            className="h-14 text-lg"
          />
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-auto bg-secondary/30">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <ShoppingCartEmpty />
              <p className="text-sm mt-4 font-medium">Le panier est vide</p>
            </div>
          ) : (
            <div className="divide-y divide-border p-2">
              {cart.map((item, idx) => (
                <div key={`${item.product.id}-${idx}`} className="flex items-center gap-4 bg-white rounded-xl p-4 shadow-sm border border-border mb-3 group transition-all hover:border-accent">
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-foreground truncate">
                      {item.product.name}
                      {item.product.id && String(item.product.id).startsWith('addpay-') && (
                        <span className="ml-2 px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-md text-[11px] font-black">Bénéfice</span>
                      )}
                      {item.size && <span className="ml-2 px-2 py-0.5 bg-primary/10 text-primary rounded-md text-[11px] font-black">{item.size}</span>}
                    </p>
                    {item.customUnitPrice ? (
                      <p className="text-xs text-primary mt-1 font-bold">
                        {item.weightKg ?? item.quantity} × {formatDZD(item.customUnitPrice)}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-1">{formatDZD(item.product.priceSale)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateQty(item.product.id, -1)} className="h-10 w-10 rounded-md bg-secondary border border-border flex items-center justify-center hover:bg-muted text-muted-foreground transition-all active:scale-95">
                      <Minus className="h-5 w-5" />
                    </button>
                    <span className="w-10 text-center text-lg font-black text-foreground">{item.quantity}</span>
                    <button onClick={() => updateQty(item.product.id, 1)} className="h-10 w-10 rounded-md bg-secondary border border-border flex items-center justify-center hover:bg-muted text-muted-foreground transition-all active:scale-95">
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="flex flex-col items-end gap-2 ml-3">
                    <p className="text-lg font-black text-foreground">{formatDZD(item.subtotal)}</p>
                    <button onClick={() => removeItem(item.product.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1.5 hover:bg-red-50 rounded-md">
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

          )}
        </div>

        {/* Totals */}
        <div className="p-6 bg-white border-t border-border space-y-4">
          <div className="flex items-center justify-between text-sm gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowReduction(true)} className="flex-1 h-8 border-dashed text-primary hover:bg-primary/5 hover:text-primary">
              <Plus className="h-4 w-4 mr-1" /> Réduction
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowExpense(true)} className="flex-1 h-8 border-dashed text-orange-500 border-orange-200 hover:bg-orange-50 hover:text-orange-600">
              <Plus className="h-4 w-4 mr-1" /> Dépense
            </Button>
            <Button variant="outline" size="sm" onClick={handleAddAdditionalPayment} className="flex-1 h-8 border-dashed text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700">
              <Plus className="h-4 w-4 mr-1" /> additionnel
            </Button>
          </div>

          {reduction > 0 && (
            <div className="flex justify-between items-center text-sm bg-red-50/60 px-3 py-2 rounded-xl border border-red-100">
              <span className="font-bold text-red-700">Réduction appliquée</span>
              <div className="flex items-center gap-2">
                <span className="font-black tracking-tight text-red-600">-{formatDZD(reduction)}</span>
                <button
                  type="button"
                  onClick={() => { setReduction(0); setTempReduction(""); }}
                  className="h-6 w-6 rounded-full bg-red-100 text-red-600 hover:bg-red-600 hover:text-white transition-all flex items-center justify-center cursor-pointer shrink-0"
                  title="Annuler la réduction"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          <div className="h-px bg-border w-full" />

          <div className="flex justify-between items-end pb-4">
            <div>
              <span className="text-muted-foreground text-sm font-bold uppercase tracking-wider block mb-2">Total à payer</span>
            </div>
            <span className="text-5xl font-black text-primary tracking-tight">{formatDZD(total)}</span>
          </div>

          <Button
            className="w-full h-20 text-2xl font-black bg-primary hover:bg-primary/90 text-white shadow-xl hover:-translate-y-1 transition-all rounded-2xl disabled:opacity-50"
            disabled={cart.length === 0}
            onClick={openCheckout}
          >
            ENCAISSER
          </Button>
        </div>
      </div>

      {/* Checkout modal */}
      <Dialog open={showCheckout} onOpenChange={(open) => { setShowCheckout(open); if (!open) setShowCreditDetails(false); }}>
        <DialogContent className="sm:max-w-xl bg-white border-0 shadow-2xl rounded-[2.5rem] p-0 overflow-hidden">
          <DialogHeader className="p-8 border-b border-gray-100 bg-gray-50/50">
            <DialogTitle className="text-3xl font-black text-[#3f5362] uppercase tracking-wide">Encaissement</DialogTitle>
          </DialogHeader>
          <div className="p-8 space-y-8">
            <div className="bg-secondary/20 border border-border p-12 rounded-[2rem] flex flex-col items-center justify-center">
              <p className="text-xs font-black text-gray-400 uppercase tracking-[0.25em] mb-3">Total à payer</p>
              <p className="text-6xl font-black text-primary tracking-tighter">{formatDZD(total)}</p>
            </div>

            {!showCreditDetails ? (
              <>
                <div className="grid grid-cols-2 gap-6">
                  <Button variant="outline" className="h-44 flex-col gap-4 rounded-3xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-foreground group" onClick={() => handleCheckout('direct')}>
                    <span className="text-2xl font-black group-hover:scale-110 transition-transform">Vente Directe</span>
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Paiement Cash</span>
                  </Button>
                  <Button variant="outline" className="h-44 flex-col gap-4 rounded-3xl border-2 border-primary text-primary hover:bg-primary/5 transition-all group" onClick={() => setShowCreditDetails(true)}>
                    <span className="text-2xl font-black uppercase tracking-widest group-hover:scale-110 transition-transform">Crédit</span>
                    <span className="text-xs font-bold text-primary/60 uppercase tracking-widest">Dette Client</span>
                  </Button>
                </div>
                <div className="pt-4">
                  <Button
                    variant="ghost"
                    className="w-full h-20 border-2 border-dashed border-indigo-200 rounded-3xl flex items-center justify-center gap-4 text-indigo-400 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 transition-all"
                    onClick={handlePrintReceipt}
                  >
                    <Printer className="h-8 w-8" />
                    <span className="text-xl font-black uppercase tracking-widest">Imprimer Facture A4</span>
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-6">
                <div className="space-y-4">
                  <h4 className="text-sm font-black text-gray-400 uppercase tracking-[0.2em] mb-4 pl-1">Informations Crédit</h4>
                  <div className="relative">
                    <Input
                      placeholder="Nom du client..."
                      className="bg-secondary/10 border-gray-200 h-20 text-2xl font-black rounded-2xl px-6 focus:ring-primary shadow-none"
                      value={clientName}
                      onChange={e => handleClientInput(e.target.value)}
                    />
                    {matchingClients.length > 0 && (
                      <div className="absolute top-full left-0 w-full bg-white border border-gray-100 rounded-2xl shadow-2xl z-[100] mt-2 overflow-hidden border-2">
                        {matchingClients.map(c => (
                          <button
                            key={c.id}
                            className="w-full text-left px-6 py-5 hover:bg-primary/5 hover:text-primary transition-colors text-lg flex justify-between items-center border-b last:border-0 border-gray-50"
                            onClick={() => selectClient(c)}
                          >
                            <span className="font-black">{c.name}</span>
                            <span className="px-3 py-1 bg-red-50 text-red-500 rounded-lg text-xs font-black">DETTE: {formatDZD(c.balance)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Input placeholder="Numéro de téléphone" className="bg-secondary/10 border-gray-200 h-16 text-lg font-bold rounded-2xl px-6 shadow-none" value={clientPhone} onChange={e => setClientPhone(e.target.value)} />

                  <div className="space-y-3 pt-6 border-t border-gray-100">
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest pl-1">Somme payée maintenant (optionnel)</p>
                    <Input
                      type="number"
                      placeholder="0.00 DZD"
                      className="bg-primary/5 border-primary/20 h-20 text-4xl font-black text-primary rounded-2xl px-6 shadow-none"
                      value={paidNow}
                      onChange={e => setPaidNow(e.target.value)}
                    />
                  </div>

                  <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                    <div className="flex justify-between text-lg font-black">
                      <span className="text-gray-400 uppercase tracking-widest text-xs mt-1">À ajouter au crédit :</span>
                      <span className="text-red-500 text-3xl tracking-tighter">{formatDZD(Math.max(0, total - (Number(paidNow) || 0)))}</span>
                    </div>
                  </div>

                  <div className="flex gap-4 pt-6">
                    <Button variant="ghost" className="flex-1 h-20 text-xl font-bold rounded-2xl text-gray-400" onClick={() => setShowCreditDetails(false)}>Précédent</Button>
                    <Button
                      className="flex-[2] h-20 bg-primary hover:bg-primary/90 text-white font-black text-2xl rounded-2xl shadow-xl shadow-primary/20 transition-all hover:-translate-y-1"
                      onClick={() => handleCheckout('credit', Number(paidNow) || 0)}
                      disabled={!clientName}
                    >
                      Confirmer le Crédit
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    className="w-full h-16 border-2 border-dashed border-indigo-200 rounded-2xl flex items-center justify-center gap-3 text-indigo-400 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 transition-all mt-2"
                    onClick={handlePrintReceipt}
                  >
                    <Printer className="h-6 w-6" />
                    <span className="text-lg font-black uppercase tracking-widest">Imprimer Facture A4</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Size Selection Modal */}
      <Dialog open={showSizeModal} onOpenChange={setShowSizeModal}>
        <DialogContent onOpenAutoFocus={e => e.preventDefault()} className="sm:max-w-sm bg-white border-0 shadow-xl rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-center text-foreground border-b border-border pb-4 mb-2 tracking-tight">
              Veuillez choisir la Taille pour {sizeModalProduct?.name || "ce produit"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4 max-h-[50vh] overflow-y-auto pr-1">
            {(() => {
              const defaultSizes = (sizeModalProduct && isPointureCategory(sizeModalProduct.category)) ? SHOE_SIZES : SHIRT_SIZES;
              const customStockSizes = sizeModalProduct?.sizeStock ? Object.keys(sizeModalProduct.sizeStock) : [];
              const allSizes = Array.from(new Set([...customStockSizes, ...defaultSizes]));

              return allSizes.map(size => {
                const qty = sizeModalProduct?.sizeStock?.[size] || 0;

                return (
                  <Button
                    key={size}
                    variant="outline"
                    onClick={() => selectSize(size)}
                    disabled={qty <= 0}
                    className="h-24 flex flex-col items-center justify-center rounded-2xl border-2 border-border hover:border-primary hover:bg-primary/5 hover:text-primary transition-all active:scale-95 shadow-sm relative overflow-hidden disabled:opacity-50 disabled:grayscale"
                  >
                    <span className="text-2xl font-black">{size}</span>
                    <div className={`mt-1 flex items-center gap-1.5 px-2 py-0.5 rounded-full ${qty > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                      <span className="text-[10px] font-black uppercase tracking-tight">Stock: {qty}</span>
                    </div>
                  </Button>
                );
              });
            })()}
          </div>

          <Button variant="ghost" onClick={() => setShowSizeModal(false)} className="w-full mt-2 font-bold text-muted-foreground">Annuler</Button>
        </DialogContent>
      </Dialog>



      {/* Reduction modal */}
      <Dialog open={showReduction} onOpenChange={setShowReduction}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-bold">Réduction</DialogTitle>
          </DialogHeader>
          <Input type="number" placeholder="Montant en DZD" className="h-11 border-border" value={tempReduction} onChange={e => setTempReduction(e.target.value)} />
          <Button onClick={() => { setReduction(Number(tempReduction) || 0); setShowReduction(false); }} className="w-full h-11 mt-2 bg-primary hover:bg-primary/90 text-white font-black">Appliquer</Button>
        </DialogContent>
      </Dialog>

      {/* Expense modal */}
      <Dialog open={showExpense} onOpenChange={setShowExpense}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-bold text-orange-600">Ajouter Dépense</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Input type="number" placeholder="Montant en DZD" className="h-11 border-border" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)} />
            <Input placeholder="Note / Raison" className="h-11 border-border" value={expenseNote} onChange={e => setExpenseNote(e.target.value)} />
            <Button onClick={handleExpenseSubmit} className="w-full h-11 mt-2 bg-orange-500 hover:bg-orange-600 text-white font-black">Enregistrer Dépense</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Additional Payment modal */}
      <Dialog open={showAddPaymentModal} onOpenChange={setShowAddPaymentModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-bold text-emerald-600">additionnel</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Input placeholder="Titre (ex: Service, Frais)" className="h-11 border-border" value={addPaymentTitle} onChange={e => setAddPaymentTitle(e.target.value)} />
            <Input type="number" placeholder="Montant en DZD" className="h-11 border-border" value={addPaymentPrice} onChange={e => setAddPaymentPrice(e.target.value)} />

            <Button onClick={confirmAddAdditionalPayment} className="w-full h-11 mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black">Ajouter au panier</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Custom Sale Creation Modal */}
      <Dialog open={showCustomModal} onOpenChange={open => { if (!open) closeCustomModal(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-bold">Vente personnalisée</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm font-semibold text-foreground">{customModalProduct?.name}</p>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Quantité d'unités</p>
              <Input
                type="number"
                placeholder="Ex. 25"
                className="h-11 border-border"
                value={customModalKg}
                onChange={e => setCustomModalKg(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Prix unitaire</p>
              <Input
                type="number"
                placeholder="Ex. 1200"
                className="h-11 border-border"
                value={customModalUnitPrice}
                onChange={e => setCustomModalUnitPrice(e.target.value)}
              />
            </div>
            <Button onClick={handleCustomSaleConfirm} className="w-full h-11 mt-2 bg-primary hover:bg-primary/90 text-white font-bold">CRÉER LA CARTE</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Perso Product Quantity Modal */}
      <Dialog open={!!persoQuantityModalProduct} onOpenChange={open => { if (!open) setPersoQuantityModalProduct(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-bold text-[#243740]">Quantité à vendre</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="rounded-xl bg-[#ecf8f0] p-3 border border-[#b2e2c4]">
              <p className="text-sm font-black text-[#243740]">{persoQuantityModalProduct?.name}</p>
              <div className="flex justify-between items-center mt-1">
                <p className="text-xs text-gray-500 font-bold">Prix unitaire: <span className="text-[#41b86d] font-black">{formatDZD(persoQuantityModalProduct?.priceSale || 0)}</span></p>
                <p className="text-xs text-gray-500 font-bold">Stock: <span className="font-black text-[#243740]">{persoQuantityModalProduct?.stock}</span></p>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Quantité d'unités à vendre</p>
              <Input
                type="number"
                placeholder="Ex. 5"
                className="h-12 border-border text-lg font-bold"
                value={persoQuantityInput}
                onChange={e => setPersoQuantityInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handlePersoQuantityConfirm(); }}
                autoFocus
              />
            </div>
            <Button
              onClick={handlePersoQuantityConfirm}
              className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-bold text-base rounded-xl"
              disabled={!persoQuantityInput || Number(persoQuantityInput) <= 0}
            >
              AJOUTER AU PANIER
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Custom Card Usage Modal */}
      <Dialog open={!!activeCustomCard} onOpenChange={open => { if (!open) setActiveCustomCard(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-bold">Quantité à vendre</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="rounded-lg bg-primary/5 p-3 border border-primary/10">
              <p className="text-sm font-bold text-primary">{activeCustomCard?.baseProductName}</p>
              <p className="text-xs text-muted-foreground">Disponible: {activeCustomCard ? activeCustomCard.kg - getCustomCardPendingKg(activeCustomCard.id) : 0} unités</p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Combien d'unités ajouter ?</p>
              <Input
                type="number"
                placeholder="Ex. 5"
                className="h-12 border-border text-lg font-bold"
                value={customCardKg}
                onChange={e => setCustomCardKg(e.target.value)}
                autoFocus
              />
            </div>
            <Button
              onClick={() => handleCustomCardAdd(activeCustomCard!, Number(customCardKg))}
              className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-bold text-lg"
              disabled={!customCardKg || Number(customCardKg) <= 0}
            >
              AJOUTER AU PANIER
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Retour Modal */}
      <Dialog open={showRetour} onOpenChange={setShowRetour}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0 rounded-[2rem] border-0 shadow-2xl">
          <DialogHeader className="p-8 border-b border-gray-100 bg-orange-50/50">
            <DialogTitle className="text-3xl font-black text-orange-600 uppercase tracking-wide">Retour de Produit</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-auto p-8">
            {!selectedSaleForReturn ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2 space-y-2">
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest pl-1">Rechercher un produit, Ticket ou Client</p>
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-gray-400" />
                      <Input
                        placeholder="Saisissez le nom du produit, le #ID du ticket..."
                        className="pl-14 h-16 rounded-2xl border-gray-200 text-lg shadow-sm focus:ring-orange-500"
                        value={retourProductSearch}
                        onChange={e => setRetourProductSearch(e.target.value)}
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center pr-1">
                      <p className="text-xs font-black text-gray-400 uppercase tracking-widest pl-1">Jour</p>
                      {retourDateFilter !== getTodayString() && (
                        <button
                          type="button"
                          onClick={() => setRetourDateFilter(getTodayString())}
                          className="text-[11px] font-bold text-orange-600 hover:underline"
                        >
                          Aujourd'hui
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                      <Input
                        type="date"
                        className="pl-12 h-16 rounded-2xl border-gray-200 text-base shadow-sm focus:ring-orange-500 font-bold"
                        value={retourDateFilter}
                        onChange={e => setRetourDateFilter(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid gap-3">
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest pl-1">Historique des ventes</p>

                  <div className="divide-y divide-gray-50 border border-gray-100 rounded-3xl overflow-hidden bg-white shadow-xl shadow-gray-100/50">
                    {(() => {
                      const filteredSales = recentSales.filter(s => s.type !== 'return');

                      const saleItems = filteredSales.flatMap(sale =>
                        sale.items.map((item, idx) => ({
                          sale,
                          item,
                          itemIdx: idx,
                          clientName: clients.find(c => c.id === sale.clientId)?.name || 'Client Direct'
                        }))
                      ).filter(record => {
                        const matchDate = !retourDateFilter || getSaleDateString(record.sale.date) === retourDateFilter;
                        const matchSearch = !retourProductSearch ||
                          record.item.product.name.toLowerCase().includes(retourProductSearch.toLowerCase()) ||
                          record.sale.id.toLowerCase().includes(retourProductSearch.toLowerCase()) ||
                          record.sale.id.toUpperCase().slice(-6).includes(retourProductSearch.toUpperCase()) ||
                          record.clientName.toLowerCase().includes(retourProductSearch.toLowerCase());
                        return matchDate && matchSearch;
                      });

                      if (recentSales.length === 0) {
                        return <div className="p-12 text-center text-gray-400 font-medium italic">Chargement des ventes... (ou aucune vente en base)</div>;
                      }

                      if (saleItems.length === 0) {
                        return (
                          <div className="p-12 text-center text-gray-400 font-medium italic">
                            {retourProductSearch || retourDateFilter ? "Aucun produit trouvé pour cette recherche ou date." : "Aucune vente enregistrée."}
                          </div>
                        );
                      }

                      return saleItems.map((record, i) => {
                        // Compute already-returned quantities for this sale's items
                        const alreadyReturnedQtys = getAlreadyReturnedQtys(record.sale);
                        const key = `${record.item.product.id}-${record.itemIdx}`;
                        const alreadyReturnedQty = alreadyReturnedQtys[key] || 0;
                        const maxReturnable = Math.max(0, record.item.quantity - alreadyReturnedQty);
                        const isFullyReturned = maxReturnable === 0;

                        return (
                          <div
                            key={`${record.sale.id}-${record.item.product.id}-${i}`}
                            className={`p-5 flex items-center justify-between group transition-colors ${isFullyReturned ? 'opacity-40 bg-gray-50/50' : 'hover:bg-orange-50/20'}`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-black text-gray-700 truncate">{record.item.product.name}</span>
                                {record.item.size && <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-md text-[10px] font-black">{record.item.size}</span>}
                                {isFullyReturned && (
                                  <span className="px-2 py-0.5 bg-red-50 text-red-500 rounded-md text-[10px] font-black">Retourné</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-gray-400 font-bold flex-wrap">
                                <span>Ticket #{record.sale.id.toUpperCase()}</span>
                                <span>•</span>
                                <span>{record.clientName}</span>
                                <span>•</span>
                                <span className={`px-1.5 py-0.5 rounded-md ${record.sale.type === 'credit' ? 'text-red-500 bg-red-50' : 'text-emerald-500 bg-emerald-50'}`}>
                                  {record.sale.type.toUpperCase()}
                                </span>
                                {(record.sale.reduction || 0) > 0 && (
                                  <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-md text-[10px] font-black border border-red-200">
                                    Réduction ticket: -{formatDZD(record.sale.reduction)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-6">
                              <div className="text-right">
                                <p className="font-black text-gray-700">{formatDZD(record.item.subtotal)}</p>
                                <p className="text-[10px] font-bold text-gray-400">Achetée: {record.item.quantity}</p>
                                {alreadyReturnedQty > 0 && (
                                  <p className="text-[10px] font-bold text-orange-500">Déjà retourné: {alreadyReturnedQty}</p>
                                )}
                                {!isFullyReturned && (
                                  <p className="text-[10px] font-bold text-emerald-600">Retournable: {maxReturnable}</p>
                                )}
                              </div>
                              <Button
                                variant="outline"
                                onClick={() => selectSaleForReturn(record.sale)}
                                disabled={isFullyReturned}
                                className="rounded-xl border-orange-200 text-orange-600 hover:bg-orange-600 hover:text-white font-bold h-10 px-4 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-orange-600"
                              >
                                Retourner
                              </Button>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Compact Ticket Header */}
                <div className="bg-orange-50/60 p-4 rounded-2xl border border-orange-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-orange-600 uppercase tracking-widest">Ticket</span>
                        <span className="text-lg font-black text-gray-800">#{selectedSaleForReturn.id.toUpperCase()}</span>
                        {(selectedSaleForReturn.reduction || 0) > 0 && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-md text-xs font-bold border border-red-200">
                            Réduction ticket: -{formatDZD(selectedSaleForReturn.reduction)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 font-medium mt-0.5">{new Date(selectedSaleForReturn.date).toLocaleString('fr-FR')}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedSaleForReturn(null)} className="text-orange-600 font-bold hover:bg-orange-100">
                    Changer
                  </Button>
                </div>

                {/* Products list */}
                <div className="space-y-2">
                  <p className="text-xs font-black text-gray-400 uppercase tracking-wider pl-1">Produits à retourner</p>
                  <div className="divide-y divide-gray-100 border border-gray-100 rounded-2xl overflow-hidden bg-white">
                    {(() => {
                      const alreadyReturnedQtys = getAlreadyReturnedQtys(selectedSaleForReturn);
                      return selectedSaleForReturn.items.map((item, idx) => {
                        const key = `${item.product.id}-${idx}`;
                        const alreadyReturnedQty = alreadyReturnedQtys[key] || 0;
                        const maxReturnable = Math.max(0, item.quantity - alreadyReturnedQty);
                        const currentVal = returnQtys[key] || 0;
                        const isFullyReturned = maxReturnable === 0;
                        return (
                          <div key={key} className={`p-4 flex items-center justify-between ${isFullyReturned ? 'opacity-50' : ''}`}>
                            <div className="flex-1 min-w-0 pr-4">
                              <p className="font-bold text-gray-800 truncate">{item.product.name} {item.size ? `(${item.size})` : ''}</p>
                              <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                                <span>Acheté: {item.quantity}</span>
                                {alreadyReturnedQty > 0 && (
                                  <span className="font-bold text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-md">
                                    Retourné: {alreadyReturnedQty}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => updateReturnQty(key, Math.max(0, currentVal - 1))}
                                  disabled={isFullyReturned || currentVal <= 0}
                                  className="h-9 w-9 rounded-xl bg-gray-100 flex items-center justify-center font-bold text-gray-700 hover:bg-orange-100 hover:text-orange-600 transition-colors disabled:opacity-30"
                                >
                                  <Minus className="h-4 w-4" />
                                </button>
                                <span className="w-7 text-center font-black text-base">{currentVal}</span>
                                <button
                                  type="button"
                                  onClick={() => updateReturnQty(key, Math.min(maxReturnable, currentVal + 1))}
                                  disabled={isFullyReturned || currentVal >= maxReturnable}
                                  className="h-9 w-9 rounded-xl bg-gray-100 flex items-center justify-center font-bold text-gray-700 hover:bg-orange-100 hover:text-orange-600 transition-colors disabled:opacity-30"
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                              </div>
                              <div className="w-24 text-right">
                                <p className="font-black text-orange-600 text-base">{formatDZD(currentVal * (item.customUnitPrice ?? item.product.priceSale))}</p>
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Refund calculation summary */}
                {(() => {
                  const rawRefundSubtotal = selectedSaleForReturn.items.reduce((sum, item, idx) => {
                    const key = `${item.product.id}-${idx}`;
                    const qty = returnQtys[key] || 0;
                    return sum + (qty * (item.customUnitPrice ?? item.product.priceSale));
                  }, 0);
                  const appliedReduction = Math.min(rawRefundSubtotal, Math.max(0, returnReduction));
                  const finalRefundTotal = Math.max(0, rawRefundSubtotal - appliedReduction);

                  return (
                    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3">
                      <div className="flex justify-between items-center text-sm font-bold text-gray-600">
                        <span>Sous-total produits :</span>
                        <span className="text-gray-800 font-black">{formatDZD(rawRefundSubtotal)}</span>
                      </div>

                      {(selectedSaleForReturn.reduction || 0) > 0 && (
                        <div className="flex justify-between items-center text-sm pt-2 border-t border-gray-200">
                          <button
                            type="button"
                            onClick={() => setReturnReduction(selectedSaleForReturn.reduction)}
                            className="font-bold text-red-600 hover:underline text-left cursor-pointer"
                            title="Cliquer pour appliquer la réduction totale"
                          >
                            Réduction à déduire ({formatDZD(selectedSaleForReturn.reduction)}) :
                          </button>
                          <div className="flex items-center gap-1">
                            <span className="text-red-600 font-bold">-</span>
                            <Input
                              type="number"
                              min={0}
                              value={returnReduction || ""}
                              onChange={e => setReturnReduction(Math.max(0, Number(e.target.value) || 0))}
                              placeholder="0"
                              className="w-28 h-9 text-right font-black text-red-600 border-gray-300 rounded-lg bg-white"
                            />
                            <span className="text-xs font-bold text-gray-500">DZD</span>
                          </div>
                        </div>
                      )}

                      <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                        <span className="text-base font-black text-gray-800 uppercase">Remboursement total :</span>
                        <span className="text-2xl font-black text-orange-600">{formatDZD(finalRefundTotal)}</span>
                      </div>
                    </div>
                  );
                })()}

                <div className="pt-2 flex gap-3">
                  <Button variant="ghost" className="flex-1 h-14 text-base font-bold rounded-xl" onClick={() => setShowRetour(false)}>Annuler</Button>
                  <Button
                    className="flex-[2] h-14 bg-orange-600 hover:bg-orange-700 text-white font-black text-lg rounded-xl shadow-lg transition-all"
                    onClick={handleReturnSubmit}
                  >
                    Confirmer le Retour
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {/* Facture Preview Modal */}
      <Dialog open={showReceiptModal} onOpenChange={setShowReceiptModal}>
        <DialogContent className="sm:max-w-2xl bg-gray-50 p-0 overflow-hidden border-0 rounded-2xl">
          {/* Preview header */}
          <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
              <Printer className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-lg font-black text-gray-900">Aperçu Facture A4</h3>
              <p className="text-xs text-gray-500 font-medium">Format professionnel — Prêt à imprimer</p>
            </div>
            <div className="ml-auto">
              <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                showCreditDetails ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
              }`}>
                {showCreditDetails ? 'Crédit' : 'Cash'}
              </span>
            </div>
          </div>

          {/* Invoice Preview */}
          <div className="p-5 overflow-y-auto max-h-[60vh]">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 font-sans text-gray-900">
              {/* Invoice header */}
              <div className="flex justify-between items-start pb-5 border-b-2 border-gray-900 mb-6">
                <div>
                  <h2 className="text-3xl font-black tracking-tight">LUXEDOR_</h2>
                  <p className="text-xs tracking-[3px] uppercase text-gray-400 mt-1">MEUBLES & DECO</p>
                  <p className="text-xs text-gray-400 mt-2 leading-relaxed">Tél: 0549 10 64 78<br />Adresse: OuledHeddaj, Boumerdes</p>
                </div>
                <div className="text-right">
                  <p className="text-xs tracking-widest uppercase text-gray-400">Facture de vente</p>
                  <p className="text-2xl font-black text-indigo-600 mt-1">#{currentSaleId.toUpperCase()}</p>
                  <p className="text-xs text-gray-500 mt-1">{new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                  <p className="text-xs text-gray-500">Caissier: <strong>{user?.username || 'Admin'}</strong></p>
                  <span className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    showCreditDetails ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {showCreditDetails ? 'Crédit' : 'Vente Directe'}
                  </span>
                </div>
              </div>

              {/* Meta row */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Vendeur</p>
                  <p className="text-sm font-semibold">LUXEDOR_</p>
                  <p className="text-xs text-indigo-500">{new Date().toLocaleTimeString('fr-FR')}</p>
                </div>
                <div
                  className="bg-gray-50 rounded-xl p-3 border border-gray-100 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/40 transition-all group relative"
                  onClick={() => {
                    if (!editingClientInModal) {
                      setTempClientName(clientName);
                      setEditingClientInModal(true);
                    }
                  }}
                  title="Cliquer pour modifier le client"
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Client</p>
                    {!editingClientInModal && (
                      <span className="text-[9px] text-indigo-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity">✏ Modifier</span>
                    )}
                  </div>
                  {editingClientInModal ? (
                    <input
                      autoFocus
                      type="text"
                      value={tempClientName}
                      onChange={e => setTempClientName(e.target.value)}
                      onBlur={() => {
                        setClientName(tempClientName);
                        setEditingClientInModal(false);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          setClientName(tempClientName);
                          setEditingClientInModal(false);
                        }
                        if (e.key === 'Escape') {
                          setEditingClientInModal(false);
                        }
                      }}
                      onClick={e => e.stopPropagation()}
                      className="w-full text-sm font-bold bg-white border border-indigo-300 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-400 text-gray-900 placeholder-gray-300"
                      placeholder="Nom du client..."
                    />
                  ) : clientName ? (
                    <>
                      <p className="text-sm font-bold text-gray-900">{clientName}</p>
                      {clientPhone && <p className="text-xs text-gray-500">{clientPhone}</p>}
                    </>
                  ) : (
                    <p className="text-sm text-gray-300 italic">Client de passage</p>
                  )}
                </div>
                <div
                  className={`bg-gray-50 rounded-xl p-3 border border-gray-100 relative group ${!showCreditDetails ? 'cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/40' : ''} transition-all`}
                  onClick={() => {
                    if (!showCreditDetails && !editingPaymentInModal) {
                      setEditingPaymentInModal(true);
                    }
                  }}
                  title={!showCreditDetails ? "Cliquer pour modifier le mode de paiement" : undefined}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Paiement</p>
                    {!showCreditDetails && !editingPaymentInModal && (
                      <span className="text-[9px] text-indigo-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity">✏ Modifier</span>
                    )}
                  </div>
                  {showCreditDetails ? (
                    <>
                      <p className="text-sm font-bold text-amber-700">Crédit client</p>
                      <p className="text-xs text-amber-600">Versé: {formatDZD(Number(paidNow) || 0)}</p>
                    </>
                  ) : editingPaymentInModal ? (
                    <div className="space-y-1.5" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setInvoicePaymentMethod('cash');
                            setEditingPaymentInModal(false);
                          }}
                          className={`flex-1 text-xs font-bold py-1 px-2 rounded-lg transition-all ${
                            invoicePaymentMethod === 'cash'
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-white border border-gray-300 text-gray-700 hover:bg-indigo-50 hover:border-indigo-300'
                          }`}
                        >
                          Cash
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setInvoicePaymentMethod('cheque');
                            setEditingPaymentInModal(false);
                          }}
                          className={`flex-1 text-xs font-bold py-1 px-2 rounded-lg transition-all ${
                            invoicePaymentMethod === 'cheque'
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-white border border-gray-300 text-gray-700 hover:bg-indigo-50 hover:border-indigo-300'
                          }`}
                        >
                          Chèque
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm font-bold text-gray-900">
                      {invoicePaymentMethod === 'cheque' ? 'Chèque' : 'Cash'}
                    </p>
                  )}
                </div>
              </div>

              {/* Items table */}
              <table className="w-full text-sm mb-5">
                <thead>
                  <tr className="bg-gray-900 text-white">
                    <th className="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wider rounded-tl-lg" style={{width:'45%'}}>Désignation</th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-black uppercase tracking-wider">Qté</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-black uppercase tracking-wider">Prix Unit.</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-black uppercase tracking-wider rounded-tr-lg">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cart.map((item, i) => {
                    const unitPrice = item.customUnitPrice ?? item.product.priceSale;
                    return (
                      <tr key={i} className={i % 2 === 1 ? 'bg-gray-50/50' : ''}>
                        <td className="px-3 py-2">
                          <p className="font-semibold text-gray-900">{item.product.name}{item.size ? <span className="ml-1 text-indigo-500 text-xs">({item.size})</span> : null}</p>
                        </td>
                        <td className="px-3 py-2 text-center text-gray-600">{item.weightKg ?? item.quantity}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{formatDZD(unitPrice)}</td>
                        <td className="px-3 py-2 text-right font-bold text-gray-900">{formatDZD(item.subtotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Totals */}
              <div className="flex justify-end mb-5">
                <div className="w-64 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Sous-total</span>
                    <span className="font-semibold">{formatDZD(subtotal)}</span>
                  </div>
                  {reduction > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Remise</span>
                      <span className="font-semibold text-red-500">- {formatDZD(reduction)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-3 border-t-2 border-gray-900">
                    <span className="text-base font-black">Total TTC</span>
                    <span className="text-xl font-black text-indigo-600">{formatDZD(total)}</span>
                  </div>
                </div>
              </div>

              {/* Credit payment breakdown */}
              {showCreditDetails && (
                <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-200 mb-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-3">Détail du paiement crédit</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-gray-600">Total facture</span><span className="font-semibold">{formatDZD(total)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600">Versement initial</span><span className="font-semibold text-emerald-600">{formatDZD(Number(paidNow) || 0)}</span></div>
                    <div className="flex justify-between pt-2 border-t border-indigo-200">
                      <span className="font-black text-gray-800">Reste (Crédit)</span>
                      <span className="font-black text-red-600 text-base">{formatDZD(Math.max(0, total - (Number(paidNow) || 0)))}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="border-t border-gray-100 pt-4 flex justify-between items-end gap-4">
                <div
                  className="min-w-0 flex-1 rounded-lg border border-dashed border-indigo-200 bg-indigo-50/40 p-3 text-xs leading-relaxed text-gray-500 transition-colors hover:border-indigo-400 hover:bg-indigo-50 cursor-text"
                  onClick={() => setEditingInvoiceNote(true)}
                >
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <strong className="text-gray-700">Note / conditions</strong>
                    {!editingInvoiceNote && <span className="text-[10px] font-bold text-indigo-500">Cliquer pour modifier</span>}
                  </div>
                  {editingInvoiceNote ? (
                    <textarea
                      autoFocus
                      value={invoiceNote}
                      onChange={event => setInvoiceNote(event.target.value)}
                      onBlur={() => setEditingInvoiceNote(false)}
                      onClick={event => event.stopPropagation()}
                      className="min-h-20 w-full resize-y rounded-md border border-indigo-300 bg-white px-2 py-1.5 text-xs leading-relaxed text-gray-700 outline-none ring-indigo-300 focus:ring-2"
                      placeholder="Écrivez les conditions pour ce client..."
                    />
                  ) : (
                    <p className="whitespace-pre-wrap">{invoiceNote.trim() || "Aucune condition particulière."}</p>
                  )}
                </div>

                <div className="border-2 border-dashed border-gray-200 rounded-lg p-3 text-xs text-gray-300 text-center min-w-[100px]">
                  Cachet<br /><br />
                </div>
              </div>

              {/* QR Codes centered at bottom of document */}
              <div className="mt-4 pt-4 border-t border-gray-100 flex justify-center gap-6 items-center">
                <div className="text-center bg-gray-50 border border-gray-100 p-3 rounded-xl">
                  <img src={INVOICE_QR_CODES.instagram} alt="Instagram QR" className="w-24 h-24 mx-auto mb-1.5 block" />
                  <p className="text-[10px] font-black text-pink-600">@luxedor_</p>
                </div>
                <div className="text-center bg-gray-50 border border-gray-100 p-3 rounded-xl">
                  <img src={INVOICE_QR_CODES.viber} alt="Viber QR" className="w-24 h-24 mx-auto mb-1.5 block" />
                  <p className="text-[10px] font-black text-purple-600">Viber</p>
                </div>
                <div className="text-center bg-gray-50 border border-gray-100 p-3 rounded-xl">
                  <img src={INVOICE_QR_CODES.location} alt="Maps QR" className="w-24 h-24 mx-auto mb-1.5 block" />
                  <p className="text-[10px] font-black text-red-600">Location</p>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="bg-white border-t border-gray-200 px-6 py-4 flex gap-3">
            <Button variant="outline" className="flex-1 h-12 rounded-xl font-bold text-gray-500" onClick={() => setShowReceiptModal(false)}>Annuler</Button>
            <Button
              className="flex-[2] h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black gap-2 shadow-lg shadow-indigo-200 transition-all hover:-translate-y-0.5"
              onClick={executePrint}
            >
              <Printer className="h-5 w-5" />
              Imprimer Facture A4
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ShoppingCartEmpty() {
  return (
    <div className="relative">
      <div className="absolute -inset-4 bg-primary/5 rounded-full blur-2xl animate-pulse" />
      <Package className="h-16 w-16 text-primary/10 relative" strokeWidth={1} />
    </div>
  );
}
