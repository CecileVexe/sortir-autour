import { expect, test, type Page } from "@playwright/test";

const LYON = { label: "Lyon", lat: 45.758, lon: 4.835, city: "Lyon", citycode: "69123", department: "69", kind: "municipality", context: "69, Rhône, Auvergne-Rhône-Alpes" };

async function mockGeocoding(page: Page) {
  await page.route("**/api/geocode?*", (route) => route.fulfill({ json: { results: [LYON] } }));
}

async function chooseLyon(page: Page) {
  const input = page.getByRole("combobox", { name: /Ville, code postal ou adresse/ });
  await input.fill("Lyon");
  await page.getByRole("option", { name: /Lyon/ }).first().click();
  await expect(input).toHaveValue("Lyon");
}

test.beforeEach(async ({ page }) => {
  await mockGeocoding(page);
});

test("questionnaire: from the starting point to results", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "D'où pars-tu ?" })).toBeVisible();
  const next = page.getByRole("button", { name: "Continuer" });
  await expect(next).toBeDisabled();
  await chooseLyon(page);
  await next.click();

  await expect(page.getByRole("heading", { name: "Jusqu'où es-tu prêt à aller ?" })).toBeVisible();
  await page.getByRole("button", { name: "30 km", exact: true }).click();
  await next.click();

  await expect(page.getByRole("heading", { name: "Avec qui ?" })).toBeVisible();
  await page.getByRole("button", { name: "En couple" }).click();
  // Age step is skipped for a couple.
  await next.click();
  await expect(page.getByRole("heading", { name: "Quel budget ?" })).toBeVisible();

  // Going back keeps answers.
  await page.getByRole("button", { name: "Retour" }).click();
  await expect(page.getByRole("button", { name: "En couple" })).toHaveAttribute("aria-pressed", "true");
  await next.click();
  await next.click(); // budget
  await next.click(); // environment
  await expect(page.getByRole("heading", { name: "Qu'est-ce qui te tente ?" })).toBeVisible();
  await page.getByRole("button", { name: /Patrimoine et visites historiques/ }).click();
  await next.click();
  await page.getByRole("button", { name: "Voir les sorties" }).click();

  await expect(page).toHaveURL(/\/resultats\?c=/);
  await expect(page.getByText(/sorties? correspond/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "[Démo] Château de Montfictif" })).toBeVisible();
  await expect(page.getByText("Démo (fictif)").first()).toBeVisible();
  await expect(page.getByText("Mode démo actif")).toBeVisible();
  // Summary of criteria
  await expect(page.getByText("30 km à vol d'oiseau")).toBeVisible();
});

test("quick search: starting point first, then filters, same engine", async ({ page }) => {
  await page.goto("/recherche");
  await expect(page.getByText("Les filtres (distance, budget")).toBeVisible();
  await chooseLyon(page);
  await expect(page.getByText("Qu'est-ce qui te tente ?")).toBeVisible();
  await page.getByLabel("Une envie précise ?").fill("poterie");
  await page.getByRole("button", { name: "Voir les sorties" }).click();
  await expect(page).toHaveURL(/\/resultats\?c=/);
  await expect(page.getByRole("heading", { name: "[Démo] Atelier poterie" })).toBeVisible();
  await expect(page.getByText(/^1 sortie correspond/)).toBeVisible();
});

test("no result: suggestions to relax the criteria", async ({ page }) => {
  await page.goto("/recherche");
  await chooseLyon(page);
  await page.getByRole("button", { name: /^Bien-être$/ }).click();
  await page.getByRole("radio", { name: "Gratuit" }).click();
  await page.getByRole("button", { name: "Voir les sorties" }).click();
  await expect(page.getByText("Aucune sortie ne correspond à tous tes critères")).toBeVisible();
  await page.getByRole("button", { name: "Ignorer le budget" }).click();
  await expect(page.getByRole("heading", { name: "[Démo] Spa des sources" })).toBeVisible();
});

test("results can be sorted and filters edited without restarting", async ({ page }) => {
  await page.goto("/recherche");
  await chooseLyon(page);
  await page.getByRole("button", { name: "Voir les sorties" }).click();
  await expect(page.getByText(/sorties correspondent/)).toBeVisible();
  await page.getByLabel("Trier par").selectOption("price");
  await expect(page.getByText(/sorties correspondent/)).toBeVisible();
  await page.getByRole("button", { name: "Modifier les filtres" }).click();
  const dialog = page.getByRole("dialog", { name: "Modifier les filtres" });
  await dialog.getByLabel("Une envie précise ?").fill("canoë");
  await dialog.getByRole("button", { name: "Mettre à jour les résultats" }).click();
  await expect(page.getByRole("heading", { name: "[Démo] Base de canoë du Moulin" })).toBeVisible();
});

test("an invalid results link shows a helpful message", async ({ page }) => {
  await page.goto("/resultats?c=abc");
  await expect(page.getByRole("heading", { name: "Ce lien de recherche n'est pas valide" })).toBeVisible();
});
