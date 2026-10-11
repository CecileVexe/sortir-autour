/**
 * Provider registry. To add a source: implement `ActivityProvider` and append it here.
 * Each provider can be disabled with its PROVIDER_*_ENABLED flag without touching the engine.
 */
import { datatourismeProvider } from "@/lib/providers/datatourisme";
import { demoProvider } from "@/lib/providers/demo";
import { openagendaProvider } from "@/lib/providers/openagenda";
import { osmProvider } from "@/lib/providers/osm";
import type { ActivityProvider } from "@/lib/providers/types";

export const ALL_PROVIDERS: readonly ActivityProvider[] = [datatourismeProvider, osmProvider, openagendaProvider, demoProvider];
