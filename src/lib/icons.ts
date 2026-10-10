import {
    Shirt, Layers, Footprints, Watch, Sparkles, Dumbbell,
    Package, ShoppingBag, Gem, Palette, Crown, Heart,
    Star, Flower2, Sun, Moon, Zap, Coffee, Gift,
    Glasses, Scissors, Umbrella, Music, Camera, Headphones,
    Cigarette, Flame, Briefcase, Pocket, Baby, Store, ShoppingBasket, ShoppingCart,
    Apple, Carrot, Fish, Beef, Milk, Croissant, Pizza, Candy, IceCream, Cookie, CupSoda,
    Wine, Beer, Martini, Brush, Wand2, Droplet, Smartphone, Laptop, Monitor, Plug, Tv,
    Stethoscope, Pill, Syringe, Cross, Wrench, Hammer, Sofa, Bed, Bath, Car, Bike, Tent, Ticket, Palmtree, Utensils, Table,
    SprayCan, Snowflake, ThermometerSnowflake, ThermometerSun, Drill, PenTool, GlassWater, User, Users,
    type LucideIcon
} from "lucide-react";

export const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
    // Mode, vêtements, accessoires
    Shirt, Layers, Footprints, Watch, Sparkles, Dumbbell, Gem, Crown,
    Glasses, Scissors, Umbrella, Briefcase, Pocket, Baby, User, Users,
    // Alimentation, supérettes, restaurants
    Store, ShoppingBasket, ShoppingBag, ShoppingCart, Package,
    Apple, Carrot, Fish, Beef, Milk, Croissant, Pizza, Candy,
    IceCream, Cookie, Coffee, CupSoda, Wine, Beer, Martini, Utensils, GlassWater,
    // Cosmétiques, beauté
    Palette, Brush, Wand2, Droplet, Flower2, Heart, Star, SprayCan,
    // Electronique, accessoires
    Smartphone, Laptop, Monitor, Plug, Tv, Music, Camera, Headphones,
    // Santé, pharmacie
    Stethoscope, Pill, Syringe, Cross,
    // Quincaillerie, meubles, véhicules divers
    Wrench, Hammer, Sofa, Bed, Bath, Car, Bike, Tent, Ticket, Palmtree, Drill, PenTool, Table,
    // Tabac, divers
    Cigarette, Flame, Sun, Moon, Zap, Gift, Snowflake, ThermometerSnowflake, ThermometerSun
};

export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICON_MAP);
