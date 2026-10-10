import { useEffect, useState, useMemo } from "react";
import { Search, Plus, User, Phone, Wallet, History, Calendar, ArrowUpCircle, ArrowDownCircle, X, Printer, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getClients, addPayment, getSalesByClient, getPaymentsByClient } from "@/lib/db";
import { Client, Sale, Payment, CartItem } from "@/lib/types";
import { formatDZD, generateId } from "@/lib/store";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useAuth } from "@/components/AuthContext";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export default function CreditPage() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const cls = await getClients();
        setClients(cls);
      } catch (error) {
        console.error("Error loading credit data:", error);
      }
    };
    loadData();
  }, []);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<'all' | 'unpaid' | 'paid'>('all');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [historyClient, setHistoryClient] = useState<Client | null>(null);
  const [history, setHistory] = useState<{ date: string; type: 'sale' | 'payment' | 'return'; amount: number; note?: string; id: string; addedBy?: string; items?: CartItem[]; reduction?: number }[]>([]);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const isMobile = useIsMobile();

  const filtered = useMemo(() => {
    return clients
      .filter(c => {
        const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search);
        if (!matchSearch) return false;
        if (filterType === 'unpaid') return c.balance > 0;
        if (filterType === 'paid') return c.balance <= 0;
        return true;
      })
      .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
  }, [clients, search, filterType]);

  useEffect(() => {
    if (historyClient) {
      const loadHistory = async () => {
        try {
          const [sales, payments] = await Promise.all([
            getSalesByClient(historyClient.id),
            getPaymentsByClient(historyClient.id)
          ]);

          const combined = [
            ...sales.filter(s => s.type === 'credit').map(s => ({
              id: s.id,
              date: s.date,
              type: 'sale' as const,
              amount: s.creditAmount,
              note: `Facture #${s.id}`,
              addedBy: s.username,
              items: s.items,
              reduction: s.reduction
            })),
            ...sales.filter(s => s.type === 'return').map(s => ({
              id: s.id,
              date: s.date,
              type: 'return' as const,
              amount: s.total || s.creditAmount,
              note: s.originalSaleId ? `Retour Facture #${s.originalSaleId}` : 'Retour Produit',
              addedBy: s.username,
              items: s.items,
              reduction: s.reduction
            })),
            ...payments.map(p => ({
              id: p.id,
              date: p.date,
              type: 'payment' as const,
              amount: p.amount,
              note: p.note,
              addedBy: p.addedBy
            }))
          ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

          setHistory(combined);
        } catch (error) {
          console.error("Error loading history:", error);
        }
      };
      loadHistory();
    } else {
      setHistory([]);
    }
  }, [historyClient]);

  const totalCredit = useMemo(() => {
    return clients.reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0);
  }, [clients]);

  const handlePayment = async () => {
    if (!selectedClient || !paymentAmount || Number(paymentAmount) <= 0) return;

    try {
      const amount = Number(paymentAmount);
      await addPayment({
        id: generateId(),
        clientId: selectedClient.id,
        amount: amount,
        date: new Date().toISOString(),
        note: paymentNote.trim() || undefined,
        addedBy: user?.username || undefined
      });

      // Refresh state
      const cls = await getClients();
      setClients(cls);
      if (historyClient) {
        const updated = cls.find(c => c.id === historyClient.id);
        if (updated) {
          setHistoryClient({ ...updated });
        }
      }
      setSelectedClient(null);
      setPaymentAmount("");
      setPaymentNote("");

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("novaInventoryUpdated"));
      }
    } catch (error) {
      console.error("Error handling payment:", error);
    }
  };

  const handlePrintClientHistory = async (targetClient: Client) => {
    try {
      const [sales, payments] = await Promise.all([
        getSalesByClient(targetClient.id),
        getPaymentsByClient(targetClient.id)
      ]);

      const clientHistory = [
        ...sales.filter(s => s.type === 'credit').map(s => ({
          id: s.id,
          date: s.date,
          type: 'sale' as const,
          amount: s.creditAmount,
          note: `Facture #${s.id}`,
          addedBy: s.username,
          items: s.items,
          reduction: s.reduction
        })),
        ...payments.map(p => ({
          id: p.id,
          date: p.date,
          type: 'payment' as const,
          amount: p.amount,
          note: p.note,
          addedBy: p.addedBy
        }))
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const printDate = new Date().toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const totalCredits = clientHistory
        .filter(item => item.type === 'sale')
        .reduce((sum, item) => sum + item.amount, 0);

      const totalPayments = clientHistory
        .filter(item => item.type === 'payment')
        .reduce((sum, item) => sum + item.amount, 0);

      const rowsHtml = clientHistory.map(item => {
        const formattedDate = format(new Date(item.date), "dd/MM/yyyy HH:mm", { locale: fr });
        const isCredit = item.type === 'sale';
        const isReturn = item.type === 'return';
        const typeLabel = isCredit ? 'Achat Crédit' : (isReturn ? 'Retour Produit' : 'Versement');
        const typeColor = isCredit ? '#dc2626' : (isReturn ? '#2563eb' : '#16a34a');

        const itemsList = item.items && item.items.length > 0
          ? item.items.map(ci => {
              const pPrice = ci.customUnitPrice ?? ci.product.priceSale;
              return `${ci.product.name} ${ci.quantity > 1 ? `(x${ci.quantity})` : ''} : ${formatDZD(pPrice)}`;
            }).join(', ')
          : (item.note || '---');

        const reductionText = item.reduction && item.reduction > 0
          ? ` <br/><small style="color: #059669; font-weight: 600;">(Remise: -${formatDZD(item.reduction)})</small>`
          : '';

        return `
          <tr>
            <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #4b5563;">${formattedDate}</td>
            <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; font-weight: 700; color: ${typeColor};">
              ${typeLabel}
            </td>
            <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #1f2937;">
              ${itemsList}${reductionText}
            </td>
            <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
              ${item.addedBy || '---'}
            </td>
            <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; font-size: 13px; font-weight: 800; text-align: right; color: ${typeColor};">
              ${isCredit ? '+' : '-'}${formatDZD(item.amount)}
            </td>
          </tr>
        `;
      }).join('');

      const htmlContent = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Historique Crédit - ${targetClient.name}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    @page { size: A4; margin: 15mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #1f2937; background: #fff; line-height: 1.5; padding: 20px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 20px; border-bottom: 2px solid #374151; margin-bottom: 24px; }
    .brand-title { font-size: 28px; font-weight: 900; color: #111827; letter-spacing: -0.5px; }
    .doc-title { font-size: 20px; font-weight: 800; color: #374151; text-align: right; }
    .date-info { font-size: 12px; color: #6b7280; text-align: right; margin-top: 4px; }
    .client-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
    .client-name { font-size: 18px; font-weight: 800; color: #111827; }
    .client-phone { font-size: 13px; font-weight: 600; color: #6b7280; margin-top: 2px; }
    .balance-box { text-align: right; }
    .balance-label { font-size: 11px; font-weight: 700; color: ${targetClient.balance > 0 ? '#ef4444' : '#10b981'}; text-transform: uppercase; letter-spacing: 1px; }
    .balance-amount { font-size: 24px; font-weight: 900; color: ${targetClient.balance > 0 ? '#dc2626' : '#059669'}; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
    .summary-card { background: #f9fafb; border: 1px solid #f3f4f6; border-radius: 10px; padding: 12px 16px; }
    .summary-title { font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; }
    .summary-value { font-size: 16px; font-weight: 800; color: #1f2937; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th { background: #f3f4f6; padding: 10px 8px; text-align: left; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #4b5563; border-bottom: 2px solid #e5e7eb; }
    th:last-child { text-align: right; }
    .footer { font-size: 11px; color: #9ca3af; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 40px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand-title">LUXEDOR_</div>
      <div style="font-size: 12px; color: #6b7280; font-weight: 600; margin-top: 2px;">Gestion de Stock & Crédits</div>
    </div>
    <div>
      <div class="doc-title">Relevé de Crédit Client</div>
      <div class="date-info">Imprimé le ${printDate}</div>
    </div>
  </div>

  <div class="client-card">
    <div>
      <div class="client-name">${targetClient.name}</div>
      <div class="client-phone">N° Téléphone: ${targetClient.phone || 'Non renseigné'}</div>
    </div>
    <div class="balance-box">
      <div class="balance-label">${targetClient.balance > 0 ? 'Solde Dû Actuel' : 'Solde Réglé'}</div>
      <div class="balance-amount">${formatDZD(targetClient.balance)}</div>
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="summary-title">Total Crédits Achetés</div>
      <div class="summary-value" style="color: #dc2626;">+${formatDZD(totalCredits)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-title">Total Versements Réalisés</div>
      <div class="summary-value" style="color: #059669;">-${formatDZD(totalPayments)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-title">Reste À Payer</div>
      <div class="summary-value" style="color: ${targetClient.balance > 0 ? '#dc2626' : '#059669'};">${formatDZD(targetClient.balance)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Date & Heure</th>
        <th>Type</th>
        <th>Détails / Produits</th>
        <th>Par</th>
        <th style="text-align: right;">Montant</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || '<tr><td colspan="5" style="text-align:center; padding: 20px; color: #9ca3af;">Aucune transaction enregistrée</td></tr>'}
    </tbody>
  </table>

  <div class="footer">
    Document édité le ${printDate} - LUXEDOR_
  </div>
</body>
</html>`;

      let printFrame = document.getElementById('credit-history-print-frame') as HTMLIFrameElement | null;
      if (!printFrame) {
        printFrame = document.createElement('iframe');
        printFrame.id = 'credit-history-print-frame';
        printFrame.style.position = 'fixed';
        printFrame.style.right = '0';
        printFrame.style.bottom = '0';
        printFrame.style.width = '0';
        printFrame.style.height = '0';
        printFrame.style.border = 'none';
        document.body.appendChild(printFrame);
      }

      const frameDoc = printFrame.contentWindow?.document;
      if (frameDoc) {
        frameDoc.open();
        frameDoc.write(htmlContent);
        frameDoc.close();

        setTimeout(() => {
          printFrame?.contentWindow?.focus();
          printFrame?.contentWindow?.print();
        }, 300);
      }
    } catch (err) {
      console.error("Error printing client credit history:", err);
    }
  };

  return (
    <div className="p-8 lg:p-12 animate-fade-in bg-[#f4f8f8] min-h-screen font-sans text-gray-800">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-12 gap-8">
        <div>
          <h2 className="text-5xl font-black tracking-tight text-[#3f5362]">Gestion des Crédits</h2>
          <p className="text-xl text-gray-500 font-medium mt-2">Suivi des dettes clients</p>
        </div>
        <div className="bg-white px-10 py-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-center items-end">
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Total Crédit Global</p>
          <p className="text-4xl font-black text-red-500">{formatDZD(totalCredit)}</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between mb-10 gap-4">
        <div className="relative max-w-xl flex-1">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-7 w-7 text-gray-400" />
          <Input
            placeholder="Rechercher un client..."
            className="pl-16 bg-white border-gray-200 h-16 shadow-sm rounded-2xl focus-visible:ring-0 text-lg font-bold w-full"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm self-start md:self-auto">
          <button
            onClick={() => setFilterType('all')}
            className={`px-5 py-3 rounded-xl text-sm font-black transition-all ${
              filterType === 'all' ? 'bg-[#3f5362] text-white shadow-md' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Tous ({clients.length})
          </button>
          <button
            onClick={() => setFilterType('unpaid')}
            className={`px-5 py-3 rounded-xl text-sm font-black transition-all ${
              filterType === 'unpaid' ? 'bg-red-500 text-white shadow-md' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            En dette ({clients.filter(c => c.balance > 0).length})
          </button>
          <button
            onClick={() => setFilterType('paid')}
            className={`px-5 py-3 rounded-xl text-sm font-black transition-all ${
              filterType === 'paid' ? 'bg-emerald-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Réglés ({clients.filter(c => c.balance <= 0).length})
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="py-32 text-center bg-white rounded-[2rem] border-2 border-dashed border-gray-200">
            <Wallet className="h-20 w-20 text-gray-200 mx-auto mb-6" />
            <p className="text-gray-400 text-2xl font-black uppercase tracking-widest">
              {search ? "Aucun client trouvé" : "Aucun client dans cette catégorie"}
            </p>
          </div>
        ) : (
          filtered.map(client => (
            <div
              key={client.id}
              onClick={() => setHistoryClient(client)}
              className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm hover:shadow-xl hover:scale-[1.01] transition-all duration-300 cursor-pointer flex items-center justify-between group px-10"
            >
              <div className="flex items-center gap-8">
                <div className={`h-16 w-16 rounded-2xl flex items-center justify-center transition-colors ${
                  client.balance > 0
                    ? "bg-secondary/50 text-[#3f5362] group-hover:bg-primary/10 group-hover:text-primary"
                    : "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100"
                }`}>
                  <User className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="font-black text-2xl text-[#3f5362] group-hover:text-primary transition-colors">{client.name}</h3>
                  <div className="flex items-center gap-3 text-gray-400 text-lg font-bold">
                    <Phone className="h-5 w-5" />
                    <span>{client.phone || "Pas de numéro"}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-8">
                <div className="text-right">
                  <p className={`text-xs font-black uppercase tracking-widest mb-1 ${
                    client.balance > 0 ? "text-red-400" : "text-emerald-500"
                  }`}>
                    {client.balance > 0 ? "Dette Actuelle" : "Solde Réglé"}
                  </p>
                  <p className={`text-3xl font-black leading-tight ${
                    client.balance > 0 ? "text-red-500" : "text-emerald-600"
                  }`}>
                    {formatDZD(client.balance)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePrintClientHistory(client);
                    }}
                    title="Imprimer l'historique"
                    className="h-14 w-14 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-primary hover:text-white transition-all shadow-xs group/print"
                  >
                    <Printer className="h-7 w-7 text-gray-400 group-hover/print:text-white transition-colors" />
                  </button>
                  <div className="h-14 w-14 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-300 group-hover:bg-primary group-hover:text-white transition-all">
                    <History className="h-7 w-7" />
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={!!historyClient} onOpenChange={open => !open && setHistoryClient(null)}>
        <DialogContent className="sm:max-w-4xl bg-[#f8fafb] border-0 shadow-2xl rounded-[2.5rem] p-0 overflow-hidden max-h-[90vh] flex flex-col">
          <DialogHeader className="p-10 bg-white border-b border-gray-100 shrink-0">
            <div className="flex justify-between items-start">
              <div>
                <DialogTitle className="text-4xl font-black text-[#3f5362] mb-2">Historique des Crédits</DialogTitle>
                <div className="flex items-center gap-4 text-gray-500 font-bold text-lg">
                  <div className="flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" />
                    <span>{historyClient?.name}</span>
                  </div>
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                  <div className="flex items-center gap-2">
                    <Phone className="h-5 w-5 text-primary" />
                    <span>{historyClient?.phone || "---"}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-xs font-black uppercase tracking-widest mb-1 ${
                  (historyClient?.balance ?? 0) > 0 ? "text-gray-400" : "text-emerald-500"
                }`}>
                  {(historyClient?.balance ?? 0) > 0 ? "Solde Total Dû" : "Solde Réglé"}
                </p>
                <p className={`text-4xl font-black ${
                  (historyClient?.balance ?? 0) > 0 ? "text-red-500" : "text-emerald-600"
                }`}>
                  {historyClient && formatDZD(historyClient.balance)}
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-10 space-y-6 custom-scrollbar">
            {history.filter(item => item.type === 'sale').length > 0 && (
              <div className="space-y-4">
                <h4 className="text-xl font-black text-[#3f5362] flex items-center gap-3">
                  <ArrowUpCircle className="h-6 w-6 text-red-500" />
                  Crédits Effectués
                </h4>
                <div className="space-y-3">
                  {history.filter(item => item.type === 'sale').map((item) => (
                    <div key={`credit-${item.id}`} className="bg-red-50/50 rounded-2xl p-5 border border-red-100">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-black text-lg text-[#3f5362]">
                          {item.addedBy ? `Par: ${item.addedBy}` : 'Utilisateur inconnu'}
                        </p>
                        <p className={`text-xl font-black text-red-500`}>
                          +{formatDZD(item.amount)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-gray-500 font-bold text-sm mb-2">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(item.date), "dd MMMM yyyy 'à' HH:mm", { locale: fr })}
                      </div>
                      {item.items && item.items.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-red-100">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Produits:</p>
                            {item.reduction && item.reduction > 0 ? (
                              <span className="text-xs font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-md">
                                Remise: -{formatDZD(item.reduction)}
                              </span>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {item.items.map((cartItem, idx) => {
                              const itemPrice = cartItem.customUnitPrice ?? cartItem.product.priceSale;
                              return (
                                <span key={idx} className="bg-white px-3.5 py-1.5 rounded-xl text-sm font-bold text-gray-700 border border-red-100 inline-flex items-center gap-2 shadow-xs">
                                  <span className="text-[#3f5362] font-black">{cartItem.product.name}</span>
                                  {cartItem.quantity > 1 && <span className="text-gray-400 font-semibold">(x{cartItem.quantity})</span>}
                                  <span className="h-3.5 w-px bg-red-200" />
                                  <span className="text-red-500 font-black">{formatDZD(itemPrice)}</span>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xl font-black text-[#3f5362] flex items-center gap-3">
                <History className="h-6 w-6 text-primary" />
                Transactions Récentes
              </h4>
              <Button
                onClick={() => {
                  setSelectedClient(historyClient);
                }}
                disabled={!historyClient || historyClient.balance <= 0}
                className="bg-primary hover:bg-primary/90 text-white font-black px-8 h-14 rounded-2xl flex items-center gap-3 shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="h-6 w-6" />
                Effectuer un Paiement
              </Button>
            </div>

            {history.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-gray-100">
                <p className="text-gray-400 font-bold text-xl">Aucune transaction trouvée</p>
              </div>
            ) : (
              <div className="space-y-4">
                {history.map((item) => {
                  const isSale = item.type === 'sale';
                  const isReturn = item.type === 'return';
                  return (
                    <div key={`${item.type}-${item.id}`} className="bg-white rounded-2xl p-6 border border-gray-100 flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-6">
                        <div className={`h-14 w-14 rounded-2xl flex items-center justify-center ${
                          isSale ? 'bg-red-50 text-red-500' : (isReturn ? 'bg-blue-50 text-blue-500' : 'bg-green-50 text-green-500')
                        }`}>
                          {isSale ? (
                            <ArrowUpCircle className="h-8 w-8" />
                          ) : isReturn ? (
                            <RotateCcw className="h-8 w-8" />
                          ) : (
                            <ArrowDownCircle className="h-8 w-8" />
                          )}
                        </div>
                        <div>
                          <p className="font-black text-xl text-[#3f5362]">
                            {isSale ? 'Crédit (Achat)' : (isReturn ? 'Retour Produit' : 'Paiement (Versement)')}
                          </p>
                          <div className="flex items-center gap-4 text-gray-400 font-bold">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {format(new Date(item.date), "dd MMMM yyyy 'à' HH:mm", { locale: fr })}
                            </span>
                            {item.note && (
                              <>
                                <div className="w-1 h-1 rounded-full bg-gray-200" />
                                <span>{item.note}</span>
                              </>
                            )}
                            {item.addedBy && (
                              <>
                                <div className="w-1 h-1 rounded-full bg-gray-200" />
                                <span className="text-primary">Par: {item.addedBy}</span>
                              </>
                            )}
                          </div>
                          {isReturn && item.items && item.items.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {item.items.map((cartItem, idx) => (
                                <span key={idx} className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-lg border border-blue-100">
                                  {cartItem.product.name} {cartItem.quantity > 1 && `(x${cartItem.quantity})`}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-2xl font-black ${
                          isSale ? 'text-red-500' : (isReturn ? 'text-blue-600' : 'text-green-500')
                        }`}>
                          {isSale ? '+' : '-'}{formatDZD(item.amount)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedClient} onOpenChange={open => !open && setSelectedClient(null)}>
        <DialogContent className="sm:max-w-xl bg-white border-0 shadow-2xl rounded-[2.5rem] p-0 overflow-hidden">
          <DialogHeader className="border-b border-gray-100 p-8 bg-gray-50/50">
            <DialogTitle className="text-3xl font-black text-[#3f5362]">
              Paiement de crédit
            </DialogTitle>
          </DialogHeader>
          {selectedClient && (
            <div className="p-8 space-y-8">
              <div className="bg-secondary/30 p-8 rounded-3xl flex justify-between items-center">
                <div>
                  <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Client</p>
                  <p className="text-2xl font-black text-[#3f5362]">{selectedClient.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Dette actuelle</p>
                  <p className="text-2xl font-black text-red-500">{formatDZD(selectedClient.balance)}</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-sm font-black uppercase tracking-widest text-gray-400 pl-1">Somme versée (DZD)</label>
                  <Input
                    type="number"
                    placeholder="Ex. 1000"
                    className="h-20 text-3xl font-black border-gray-200 rounded-2xl focus:ring-primary focus:border-primary transition-all shadow-none"
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(e.target.value)}
                    max={selectedClient.balance}
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-sm font-black uppercase tracking-widest text-gray-400 pl-1">Note / Remarque (Optionnel)</label>
                  <Input
                    placeholder="Ex. Versement partiel"
                    className="h-16 text-lg border-gray-200 rounded-2xl font-bold"
                    value={paymentNote}
                    onChange={e => setPaymentNote(e.target.value)}
                  />
                </div>
              </div>

              <div className="pt-8 border-t border-gray-100 flex flex-col gap-4">
                <div className="flex justify-between text-lg font-black bg-gray-50 p-4 rounded-xl">
                  <span className="text-gray-400">Reste après paiement :</span>
                  <span className="text-[#3f5362]">{formatDZD(Math.max(0, selectedClient.balance - (Number(paymentAmount) || 0)))}</span>
                </div>
                <Button
                  className="w-full h-20 bg-primary hover:bg-primary/90 text-white font-black text-2xl rounded-[1.5rem] shadow-xl shadow-primary/20 transition-all hover:-translate-y-1"
                  onClick={handlePayment}
                  disabled={!paymentAmount || Number(paymentAmount) <= 0}
                >
                  Confirmer le paiement
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
