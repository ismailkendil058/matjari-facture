import { useEffect, useState, useRef } from "react";
import {
    Plus, Trash2, Edit3, Save, X, Upload, Check, Package,
    Shirt, Sparkles, Footprints
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Category } from "@/lib/types";
import { getCategories, addCategory, updateCategory, deleteCategory } from "@/lib/db";
import { generateId } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { CATEGORY_ICON_MAP, CATEGORY_ICON_NAMES } from "@/lib/icons";

// Icon map for selection
const ICON_MAP = CATEGORY_ICON_MAP;
const ICON_NAMES = CATEGORY_ICON_NAMES;

// Preset color palette
const COLOR_PRESETS = [
    "#9DC6D8", "#6B909B", "#5F676D", "#34675C", "#A58AB7",
    "#E16969", "#E5A862", "#7A9CA5", "#4A90D9", "#D4526E",
    "#2ED573", "#FF6B81", "#7158E2", "#3AE374", "#FF9F43",
    "#EE5A24", "#0652DD", "#9B59B6", "#1ABC9C", "#E74C3C",
    "#2C3E50", "#F39C12", "#27AE60", "#8E44AD", "#C0392B",
    "#16A085", "#2980B9", "#D35400", "#7F8C8D", "#BDC3C7",
];

const SHIRT_SIZES_DISPLAY = "XS, S, M, L, XL, XXL, 3XL, 4XL, 5XL";
const SHOE_SIZES_DISPLAY = "28 → 48";

const emptyCategory: Omit<Category, "id"> = {
    key: "",
    label: "",
    labelAr: "",
    color: "#9DC6D8",
    hoverColor: "#8AB6C8",
    icon: "Package",
    hasVentePersonnalisee: false,
    hasTailles: false,
    hasPointure: false,
    sortOrder: 0,
};

function darkenColor(hex: string, percent: number = 12): string {
    const num = parseInt(hex.replace("#", ""), 16);
    const r = Math.max(0, (num >> 16) - Math.round(2.55 * percent));
    const g = Math.max(0, ((num >> 8) & 0x00FF) - Math.round(2.55 * percent));
    const b = Math.max(0, (num & 0x0000FF) - Math.round(2.55 * percent));
    return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, "0")}`;
}

export default function CategoriesPage() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [showDialog, setShowDialog] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [form, setForm] = useState<Omit<Category, "id">>(emptyCategory);
    const [showIconPicker, setShowIconPicker] = useState(false);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();
    // Password gate state
    const [authorized, setAuthorized] = useState<boolean>(false);
    const [password, setPassword] = useState("");
    const [pwError, setPwError] = useState<string | null>(null);

    useEffect(() => {
        if (authorized) {
            loadCategories();
        }
    }, [authorized]);

    const loadCategories = async () => {
        const cats = await getCategories();
        setCategories(cats);
    };

    const openAdd = () => {
        setEditingCategory(null);
        setForm({ ...emptyCategory, sortOrder: categories.length });
        setShowDialog(true);
    };

    const openEdit = (cat: Category) => {
        setEditingCategory(cat);
        setForm({
            key: cat.key,
            label: cat.label,
            labelAr: cat.labelAr,
            color: cat.color,
            hoverColor: cat.hoverColor,
            icon: cat.icon,
            customIcon: cat.customIcon,
            hasVentePersonnalisee: cat.hasVentePersonnalisee,
            hasTailles: cat.hasTailles,
            hasPointure: cat.hasPointure,
            sortOrder: cat.sortOrder,
        });
        setShowDialog(true);
    };

    const handleSave = async () => {
        if (!form.label.trim() || !form.key.trim()) {
            toast({ title: "Erreur", description: "Le nom et la clé sont obligatoires." });
            return;
        }

        try {
            if (editingCategory) {
                const updated: Category = { ...editingCategory, ...form };
                await updateCategory(updated);
                toast({ title: "Catégorie modifiée", description: `"${form.label}" a été mise à jour.` });
            } else {
                const newCat: Category = {
                    id: generateId(),
                    ...form,
                };
                await addCategory(newCat);
                toast({ title: "Catégorie créée", description: `"${form.label}" a été ajoutée.` });
            }
            await loadCategories();
            setShowDialog(false);
            setEditingCategory(null);
        } catch (error) {
            console.error("Error saving category:", error);
            toast({ title: "Erreur", description: "Impossible de sauvegarder la catégorie." });
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteCategory(id);
            await loadCategories();
            setConfirmDelete(null);
            toast({ title: "Catégorie supprimée", description: "La catégorie a été supprimée." });
        } catch (error) {
            console.error("Error deleting category:", error);
            toast({ title: "Erreur", description: "Impossible de supprimer la catégorie." });
        }
    };

    const handleColorChange = (color: string) => {
        setForm(prev => ({
            ...prev,
            color,
            hoverColor: darkenColor(color),
        }));
    };

    const handlePasswordSubmit = () => {
        const SECRET = "18112003";
        if (password === SECRET) {
            setAuthorized(true);
            setPassword("");
            setPwError(null);
        } else {
            setPwError("Mot de passe incorrect");
        }
    };

    const handleIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 512000) {
            toast({ title: "Fichier trop volumineux", description: "L'icône ne doit pas dépasser 500 Ko." });
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            setForm(prev => ({
                ...prev,
                customIcon: reader.result as string,
                icon: "custom",
            }));
        };
        reader.readAsDataURL(file);
        e.target.value = "";
    };

    const renderIconPreview = (cat: Category | Omit<Category, "id">, size: number = 32) => {
        if (cat.customIcon) {
            return <img src={cat.customIcon} alt="icon" style={{ width: size, height: size }} className="object-contain rounded-lg" />;
        }
        const IconComp = ICON_MAP[cat.icon] || Package;
        return <IconComp style={{ width: size, height: size }} className="text-white drop-shadow-sm" strokeWidth={1.5} />;
    };

    const getFeatureBadges = (cat: Category) => {
        const badges: { label: string; detail: string; color: string }[] = [];
        if (cat.hasVentePersonnalisee) badges.push({ label: "Vente Perso.", detail: "Vente personnalisée activée", color: "bg-purple-100 text-purple-700" });
        if (cat.hasTailles) badges.push({ label: "Tailles", detail: SHIRT_SIZES_DISPLAY, color: "bg-blue-100 text-blue-700" });
        if (cat.hasPointure) badges.push({ label: "Pointure", detail: SHOE_SIZES_DISPLAY, color: "bg-amber-100 text-amber-700" });
        return badges;
    };

    if (!authorized) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#f4f8f8] p-6">
                <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8">
                    <h3 className="text-2xl font-black mb-4">Accès restreint</h3>
                    <Input
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Mot de passe"
                        className="mb-3 h-12"
                    />
                    {pwError && <p className="text-sm text-red-500 mb-3">{pwError}</p>}
                    <div className="flex gap-3 justify-end">
                        <Button onClick={handlePasswordSubmit} className="h-12 px-6 bg-primary text-white">Valider</Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 lg:p-12 animate-fade-in bg-[#f4f8f8] min-h-screen font-sans text-gray-800">
            {/* Header */}
            <div className="mb-10 flex items-center justify-between">
                <div>
                    <h2 className="text-5xl font-black tracking-tight text-[#3f5362]">Catégories</h2>
                    <p className="text-lg text-gray-400 font-bold mt-2">Gestion des catégories de produits</p>
                </div>
                <Button
                    onClick={openAdd}
                    className="h-16 px-8 bg-primary hover:bg-primary/90 text-white rounded-2xl font-black text-lg shadow-xl shadow-primary/20 transition-all hover:-translate-y-1 active:scale-95 flex items-center gap-3"
                >
                    <Plus className="h-6 w-6" strokeWidth={3} />
                    Nouvelle Catégorie
                </Button>
            </div>

            {/* Category Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                {categories.map(cat => {
                    const badges = getFeatureBadges(cat);
                    return (
                        <div
                            key={cat.id}
                            className="bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden group hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
                        >
                            {/* Color Header */}
                            <div
                                className="h-28 flex items-center justify-between px-6 relative overflow-hidden"
                                style={{ backgroundColor: cat.color }}
                            >
                                <div className="flex items-center gap-4 z-10">
                                    <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg">
                                        {renderIconPreview(cat, 32)}
                                    </div>
                                    <div>
                                        <p className="text-xl font-black text-white leading-tight drop-shadow-sm">{cat.label}</p>
                                        <p className="text-lg font-bold text-white/80 leading-tight">{cat.labelAr}</p>
                                    </div>
                                </div>
                                {/* Decorative circle */}
                                <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full opacity-20" style={{ backgroundColor: cat.hoverColor }} />
                            </div>

                            {/* Body */}
                            <div className="p-6 space-y-4">
                                {/* Key */}
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Clé:</span>
                                    <span className="px-3 py-1 bg-gray-100 rounded-lg text-xs font-black text-gray-600">{cat.key}</span>
                                </div>

                                {/* Feature Badges */}
                                {badges.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {badges.map((badge, i) => (
                                            <span key={i} className={`px-3 py-1.5 rounded-xl text-[11px] font-black ${badge.color}`} title={badge.detail}>
                                                {badge.label}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-300 font-bold">Aucune option spéciale</p>
                                )}

                                {/* Actions */}
                                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => openEdit(cat)}
                                        className="flex-1 h-12 rounded-xl text-primary hover:bg-primary/5 font-black text-sm gap-2"
                                    >
                                        <Edit3 className="h-4 w-4" />
                                        Modifier
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setConfirmDelete(cat.id)}
                                        className="h-12 w-12 rounded-xl text-red-400 hover:bg-red-50 hover:text-red-600 p-0"
                                    >
                                        <Trash2 className="h-5 w-5" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {categories.length === 0 && (
                    <div className="col-span-full py-20 text-center">
                        <Package className="h-16 w-16 mx-auto text-gray-200 mb-4" />
                        <p className="text-gray-400 text-xl font-bold uppercase tracking-widest">Aucune catégorie</p>
                        <p className="text-gray-300 text-sm mt-2">Cliquez sur "Nouvelle Catégorie" pour commencer.</p>
                    </div>
                )}
            </div>

            {/* Add/Edit Dialog */}
            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent className="max-w-2xl rounded-3xl border-0 shadow-2xl p-0 overflow-hidden max-h-[90vh] overflow-y-auto">
                    {/* Dialog Color Header Preview */}
                    <div
                        className="h-24 flex items-center gap-4 px-8 relative transition-colors duration-300"
                        style={{ backgroundColor: form.color }}
                    >
                        <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                            {renderIconPreview(form, 28)}
                        </div>
                        <div>
                            <p className="text-xl font-black text-white leading-tight">{form.label || "Nouvelle catégorie"}</p>
                            <p className="text-base font-bold text-white/70">{form.labelAr || "اسم بالعربية"}</p>
                        </div>
                    </div>

                    <div className="px-8 pb-8 pt-6 space-y-7">
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-black tracking-tight text-gray-800">
                                {editingCategory ? "Modifier la catégorie" : "Nouvelle catégorie"}
                            </DialogTitle>
                        </DialogHeader>

                        {/* Names */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[11px] font-black uppercase text-gray-400 tracking-widest pl-1">Nom Français *</label>
                                <Input
                                    value={form.label}
                                    onChange={e => {
                                        const label = e.target.value;
                                        setForm(prev => ({
                                            ...prev,
                                            label,
                                            key: prev.key || label.toLowerCase().replace(/[^a-z0-9]/g, ""),
                                        }));
                                    }}
                                    placeholder="ex: Chaussures"
                                    className="h-14 border-gray-200 rounded-xl font-bold text-lg px-5"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-black uppercase text-gray-400 tracking-widest pl-1">Nom Arabe</label>
                                <Input
                                    value={form.labelAr}
                                    onChange={e => setForm(prev => ({ ...prev, labelAr: e.target.value }))}
                                    placeholder="مثال: أحذية"
                                    dir="rtl"
                                    className="h-14 border-gray-200 rounded-xl font-bold text-lg px-5"
                                />
                            </div>
                        </div>

                        {/* Key */}
                        <div className="space-y-2">
                            <label className="text-[11px] font-black uppercase text-gray-400 tracking-widest pl-1">Clé unique (identifiant) *</label>
                            <Input
                                value={form.key}
                                onChange={e => setForm(prev => ({ ...prev, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))}
                                placeholder="ex: salon"
                                className="h-14 border-gray-200 rounded-xl font-bold text-lg px-5 font-mono"
                            />
                        </div>

                        {/* Color Selection */}
                        <div className="space-y-3">
                            <label className="text-[11px] font-black uppercase text-gray-400 tracking-widest pl-1">Couleur</label>
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setShowColorPicker(!showColorPicker)}
                                    className="w-14 h-14 rounded-2xl shadow-lg border-4 border-white transition-transform hover:scale-110 active:scale-95"
                                    style={{ backgroundColor: form.color }}
                                />
                                <Input
                                    type="text"
                                    value={form.color}
                                    onChange={e => handleColorChange(e.target.value)}
                                    placeholder="#9DC6D8"
                                    className="h-14 border-gray-200 rounded-xl font-mono font-bold text-lg px-5 w-44"
                                />
                                <input
                                    type="color"
                                    value={form.color}
                                    onChange={e => handleColorChange(e.target.value)}
                                    className="h-14 w-14 rounded-xl border-0 cursor-pointer"
                                />
                            </div>
                            {showColorPicker && (
                                <div className="grid grid-cols-10 gap-2 p-4 bg-gray-50 rounded-2xl border border-gray-100 animate-fade-in">
                                    {COLOR_PRESETS.map(color => (
                                        <button
                                            key={color}
                                            onClick={() => { handleColorChange(color); setShowColorPicker(false); }}
                                            className={`w-9 h-9 rounded-xl transition-all hover:scale-125 hover:shadow-lg ${form.color === color ? "ring-4 ring-primary ring-offset-2 scale-110" : ""}`}
                                            style={{ backgroundColor: color }}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Icon Selection */}
                        <div className="space-y-3">
                            <label className="text-[11px] font-black uppercase text-gray-400 tracking-widest pl-1">Icône</label>
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setShowIconPicker(!showIconPicker)}
                                    className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg border-2 border-gray-100 transition-transform hover:scale-110 active:scale-95"
                                    style={{ backgroundColor: form.color }}
                                >
                                    {renderIconPreview(form, 24)}
                                </button>
                                <span className="text-sm font-bold text-gray-500">{form.customIcon ? "Icône personnalisée" : form.icon}</span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="h-12 rounded-xl font-bold gap-2 border-dashed border-2"
                                >
                                    <Upload className="h-4 w-4" />
                                    Uploader une icône
                                </Button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleIconUpload}
                                    className="hidden"
                                />
                            </div>
                            {showIconPicker && (
                                <div className="grid grid-cols-8 gap-2 p-4 bg-gray-50 rounded-2xl border border-gray-100 animate-fade-in max-h-60 overflow-y-auto">
                                    {ICON_NAMES.map(name => {
                                        const IconComp = ICON_MAP[name];
                                        return (
                                            <button
                                                key={name}
                                                onClick={() => {
                                                    setForm(prev => ({ ...prev, icon: name, customIcon: undefined }));
                                                    setShowIconPicker(false);
                                                }}
                                                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all hover:scale-110 ${form.icon === name && !form.customIcon ? "ring-4 ring-primary bg-primary/10 scale-110" : "bg-white border border-gray-100 hover:shadow-md"}`}
                                                title={name}
                                            >
                                                <IconComp className="h-5 w-5 text-gray-600" />
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Feature Toggles */}
                        <div className="space-y-3">
                            <label className="text-[11px] font-black uppercase text-gray-400 tracking-widest pl-1">Fonctionnalités spéciales</label>
                            <div className="space-y-3">
                                {/* Vente personnalisée */}
                                <button
                                    onClick={() => setForm(prev => ({ ...prev, hasVentePersonnalisee: !prev.hasVentePersonnalisee }))}
                                    className={`w-full flex items-center justify-between p-5 rounded-2xl border-2 transition-all ${form.hasVentePersonnalisee ? "border-purple-300 bg-purple-50" : "border-gray-100 bg-white hover:border-gray-200"}`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${form.hasVentePersonnalisee ? "bg-purple-200" : "bg-gray-100"}`}>
                                            <Sparkles className={`h-5 w-5 ${form.hasVentePersonnalisee ? "text-purple-600" : "text-gray-400"}`} />
                                        </div>
                                        <div className="text-left">
                                            <p className={`font-black text-sm ${form.hasVentePersonnalisee ? "text-purple-700" : "text-gray-600"}`}>Vente personnalisée</p>
                                            <p className="text-xs text-gray-400 mt-0.5">Permet la vente au kg avec prix personnalisé</p>
                                        </div>
                                    </div>
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${form.hasVentePersonnalisee ? "bg-purple-600" : "bg-gray-200"}`}>
                                        <Check className={`h-5 w-5 ${form.hasVentePersonnalisee ? "text-white" : "text-transparent"}`} />
                                    </div>
                                </button>

                                {/* Tailles */}
                                <button
                                    onClick={() => setForm(prev => ({ ...prev, hasTailles: !prev.hasTailles, hasPointure: !prev.hasTailles ? false : prev.hasPointure }))}
                                    className={`w-full flex items-center justify-between p-5 rounded-2xl border-2 transition-all ${form.hasTailles ? "border-blue-300 bg-blue-50" : "border-gray-100 bg-white hover:border-gray-200"}`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${form.hasTailles ? "bg-blue-200" : "bg-gray-100"}`}>
                                            <Shirt className={`h-5 w-5 ${form.hasTailles ? "text-blue-600" : "text-gray-400"}`} />
                                        </div>
                                        <div className="text-left">
                                            <p className={`font-black text-sm ${form.hasTailles ? "text-blue-700" : "text-gray-600"}`}>Tailles vestimentaires</p>
                                            <p className="text-xs text-gray-400 mt-0.5">{SHIRT_SIZES_DISPLAY}</p>
                                        </div>
                                    </div>
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${form.hasTailles ? "bg-blue-600" : "bg-gray-200"}`}>
                                        <Check className={`h-5 w-5 ${form.hasTailles ? "text-white" : "text-transparent"}`} />
                                    </div>
                                </button>

                                {/* Pointure */}
                                <button
                                    onClick={() => setForm(prev => ({ ...prev, hasPointure: !prev.hasPointure, hasTailles: !prev.hasPointure ? false : prev.hasTailles }))}
                                    className={`w-full flex items-center justify-between p-5 rounded-2xl border-2 transition-all ${form.hasPointure ? "border-amber-300 bg-amber-50" : "border-gray-100 bg-white hover:border-gray-200"}`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${form.hasPointure ? "bg-amber-200" : "bg-gray-100"}`}>
                                            <Footprints className={`h-5 w-5 ${form.hasPointure ? "text-amber-600" : "text-gray-400"}`} />
                                        </div>
                                        <div className="text-left">
                                            <p className={`font-black text-sm ${form.hasPointure ? "text-amber-700" : "text-gray-600"}`}>Pointures (Chaussures)</p>
                                            <p className="text-xs text-gray-400 mt-0.5">{SHOE_SIZES_DISPLAY}</p>
                                        </div>
                                    </div>
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${form.hasPointure ? "bg-amber-600" : "bg-gray-200"}`}>
                                        <Check className={`h-5 w-5 ${form.hasPointure ? "text-white" : "text-transparent"}`} />
                                    </div>
                                </button>
                            </div>
                        </div>

                        {/* Save Button */}
                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                            <Button
                                variant="ghost"
                                onClick={() => setShowDialog(false)}
                                className="h-14 px-8 rounded-xl font-black text-gray-400"
                            >
                                Annuler
                            </Button>
                            <Button
                                onClick={handleSave}
                                className="h-14 px-10 bg-primary hover:bg-primary/90 text-white rounded-xl font-black text-base gap-2 shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5"
                            >
                                <Save className="h-5 w-5" />
                                {editingCategory ? "Enregistrer" : "Créer"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
                <DialogContent className="max-w-md rounded-3xl border-0 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-800">Confirmer la suppression</DialogTitle>
                    </DialogHeader>
                    <p className="text-gray-500 font-medium">
                        Êtes-vous sûr de vouloir supprimer cette catégorie ? Les produits existants dans cette catégorie ne seront pas affectés mais apparaîtront sous une catégorie inconnue.
                    </p>
                    <div className="flex justify-end gap-3 mt-4">
                        <Button
                            variant="ghost"
                            onClick={() => setConfirmDelete(null)}
                            className="h-12 px-6 rounded-xl font-black text-gray-400"
                        >
                            Annuler
                        </Button>
                        <Button
                            onClick={() => confirmDelete && handleDelete(confirmDelete)}
                            className="h-12 px-8 bg-red-500 hover:bg-red-600 text-white rounded-xl font-black gap-2"
                        >
                            <Trash2 className="h-4 w-4" />
                            Supprimer
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
