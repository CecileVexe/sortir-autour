import {
  Baby,
  Bike,
  Castle,
  FerrisWheel,
  Flower2,
  Landmark,
  Moon,
  Mountain,
  Palette,
  PartyPopper,
  PawPrint,
  ShoppingBasket,
  Sparkles,
  Ticket,
  Trees,
  UtensilsCrossed,
  Waves,
  type LucideIcon,
} from "lucide-react";
import type { CategoryId } from "@/config/categories";

const ICONS: Record<CategoryId, LucideIcon> = {
  nature: Mountain,
  parks: Trees,
  culture: Landmark,
  heritage: Castle,
  leisure: Ticket,
  sport: Bike,
  nautical: Waves,
  food: UtensilsCrossed,
  markets: ShoppingBasket,
  workshops: Palette,
  animals: PawPrint,
  themeparks: FerrisWheel,
  unusual: Sparkles,
  nightlife: Moon,
  events: PartyPopper,
  family: Baby,
  wellness: Flower2,
};

export function CategoryIcon({ id, className }: { id: CategoryId; className?: string }) {
  const Icon = ICONS[id] ?? Sparkles;
  return <Icon className={className} aria-hidden="true" />;
}
