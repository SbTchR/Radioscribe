import { test, expect } from "@playwright/test";
async function create(page, n = 2) {
  await page.goto("./");
  await page
    .getByRole("button", { name: "Créer une chronique", exact: true })
    .click();
  await page.getByLabel("Sujet de la chronique").fill("Ondes et montagnes");
  await page.getByRole("button", { name: String(n), exact: true }).click();
  for (let i = 0; i < n; i++)
    await page
      .getByLabel("Prénom " + (i + 1))
      .fill(["Léa", "Noah", "Mila", "Ali"][i]);
  await page.getByRole("button", { name: "Ouvrir l’introduction" }).click();
  await expect(
    page.getByRole("heading", { name: "Introduction", exact: true }),
  ).toBeVisible();
}
const btn = (p, name) => p.getByRole("button", { name, exact: true });
async function add(page, name, text) {
  await page.locator(".addline").getByRole("button", { name }).click();
  await page
    .getByRole("textbox", { name: new RegExp("Réplique .* de " + name) })
    .last()
    .fill(text);
  await btn(page, "Valider la réplique").click();
}
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "gpu", {
      configurable: true,
      get: () => undefined,
    });
  });
  await context.route("https://huggingface.co/**", (r) => r.abort());
});
test("Du dialogue à la répétition et au PDF personnalisé", async ({
  page,
}, info) => {
  await create(page);
  await add(page, "Léa", "Bonjour. Voici notre sujet.");
  const text = page.getByRole("textbox", { name: "Réplique 1 de Léa" });
  await text.focus();
  await text.evaluate((t) => {
    t.setSelectionRange(8, 8);
    t.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await btn(page, "Options de la réplique 1").click();
  await btn(page, "Diviser au curseur").click();
  await expect(page.locator(".block")).toHaveCount(2);
  await btn(page, "Options de la réplique 1").click();
  await btn(page, "Insérer après").click();
  await page.getByRole("dialog").getByRole("button", { name: "Noah" }).click();
  const middle = page.getByRole("textbox", { name: "Réplique 2 de Noah" });
  await middle.fill("Alors ?");
  await middle.press("Home");
  await btn(page, "SOS rédaction").click();
  await page.getByText("Réagir et rebondir", { exact: true }).click();
  await btn(page, "Ah bon ? Je ne savais pas !").click();
  await expect(middle).toHaveValue("Ah bon ? Je ne savais pas !Alors ?");
  await btn(page, "Valider l’introduction et créer la première partie").click();
  await page.getByRole("button", { name: /Origines et histoire/ }).click();
  await page.getByRole("button", { name: /Chiffres et statistiques/ }).click();
  await page.getByLabel("Titre de la partie").fill("Le relief");
  await btn(page, "Valider les angles et rédiger la partie").click();
  await add(page, "Noah", "Les Alpes traversent plusieurs pays.");
  await btn(page, "Valider cette partie").click();
  await btn(page, "Passer à la conclusion").click();
  await add(page, "Léa", "Place à la musique avec notre groupe préféré.");
  await btn(page, "Terminer la chronique et relire le script").click();
  await expect(page.locator(".line")).toHaveCount(5);
  await btn(page, "Téléprompteur").click();
  await btn(page, "Défiler").click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByText("Relecture du script", { exact: true }),
  ).toBeVisible();
  await btn(page, "Préparer l’impression").click();
  await page
    .getByRole("combobox", { name: "Version", exact: true })
    .selectOption("all");
  await expect(page.locator(".script")).toHaveCount(2);
  await btn(page, "Imprimer / Enregistrer en PDF").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await btn(page, "Revenir au script").click();
  await page.pdf({
    path: info.outputPath("scripts.pdf"),
    preferCSSPageSize: true,
    printBackground: true,
  });
  await page.reload();
  await btn(page, "Ouvrir la chronique").click();
  await btn(page, "Noah").click();
  await btn(page, "Relire le script").click();
  await expect(page.locator(".line")).toHaveCount(5);
});
test("Accueil mobile et création à quatre", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await create(page, 4);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await add(page, "Ali", "À vous les studios !");
  await expect(page.locator(".meter")).toContainText("100 %");
});
test("Chronique longue, réorganisation et impression sur plusieurs pages", async ({
  page,
}, info) => {
  await create(page, 3);
  await add(page, "Léa", "Bienvenue dans notre émission.");
  async function part(name) {
    await page.getByRole("button", { name: /Autre aspect/ }).click();
    await page.getByLabel("Titre de la partie").fill(name);
    await btn(page, "Valider les angles et rédiger la partie").click();
  }
  await btn(page, "Valider l’introduction et créer la première partie").click();
  await part("Les départs");
  await add(
    page,
    "Noah",
    Array(85)
      .fill("Chaque train traverse la vallée puis entre dans le tunnel.")
      .join(" "),
  );
  await btn(page, "Valider cette partie").click();
  await btn(page, "Ajouter une nouvelle partie").click();
  await part("Les arrivées");
  await add(page, "Mila", "Le train arrive à Lausanne.");
  await btn(page, "Options de la partie").click();
  await btn(page, "Monter la partie").click();
  await expect(page.locator(".editor h1")).toHaveText(
    "Partie 1 · Les arrivées",
  );
  await btn(page, "Options de la partie").click();
  await btn(page, "Modifier le titre et les angles").click();
  await page.getByLabel("Titre de la partie").fill("En gare");
  await btn(page, "Valider les angles et rédiger la partie").click();
  await expect(page.locator(".block textarea")).toHaveValue(
    "Le train arrive à Lausanne.",
  );
  await btn(page, "Relire le script").click();
  await btn(page, "Préparer l’impression").click();
  await page
    .getByRole("combobox", { name: "Version", exact: true })
    .selectOption("all");
  await page.pdf({
    path: info.outputPath("long.pdf"),
    preferCSSPageSize: true,
    printBackground: false,
  });
});
