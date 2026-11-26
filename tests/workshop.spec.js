import { test, expect } from "@playwright/test";
async function create(page, n = 2) {
  await page.goto("./");
  await page
    .getByRole("button", { name: "Créer une chronique", exact: true })
    .click();
  const solo = page.getByLabel("Travailler uniquement sur cet appareil");
  if (await solo.count()) await solo.check();
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
  const card = page.locator(".block").last();
  const editor = card.getByRole("textbox", {
    name: new RegExp("Réplique .* de " + name),
  });
  await expect(editor).toBeFocused();
  await editor.fill(text);
  await expect
    .poll(() =>
      page.evaluate(
        (expected) =>
          Object.keys(localStorage)
            .filter((key) => key.startsWith("radioscribe.1.room."))
            .some((key) =>
              Object.values(JSON.parse(localStorage[key]).rows).some(
                (row) => row.data.text === expected,
              ),
            ),
        text,
      ),
    )
    .toBe(true);
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
  await expect(page.locator(".code")).toHaveText(/^[2-9A-HJ-NP-Z]{5}\s*$/);
  await expect(page.locator(".meter")).not.toContainText("mots/min");
  await page.setViewportSize({ width: 1060, height: 900 });
  const intro = btn(
    page.getByRole("navigation", { name: "Structure du script" }),
    "Introduction",
  );
  await expect(intro).toBeVisible();
  expect(
    await intro.locator("span").evaluate((text) => {
      const range = document.createRange();
      range.selectNodeContents(text);
      return (
        range.getClientRects().length === 1 &&
        text.scrollWidth <= text.clientWidth
      );
    }),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  const guides = page.getByRole("complementary", {
    name: "Pistes de rédaction",
  });
  const amorce = guides.getByRole("checkbox", { name: "Amorce", exact: true });
  await expect(
    guides.getByText("Comment donner envie d'écouter ?"),
  ).toBeVisible();
  await expect(
    guides.getByText("Coche les pistes que tu as rédigées."),
  ).toHaveCount(0);
  const examples = guides.getByRole("group", {
    name: "Exemples pour Amorce",
    exact: true,
  });
  await expect(examples.locator(".guide-phrase")).toHaveText(
    "Saviez-vous que… ?",
  );
  await btn(examples, "Exemple suivant").press("Enter");
  await expect(examples.locator(".guide-phrase")).toHaveText(
    "Imaginez un instant…",
  );
  await btn(examples, "Exemple précédent").click();
  await btn(examples, "Exemple précédent").click();
  await expect(examples.locator(".guide-phrase")).toHaveText(
    "Vous êtes-vous déjà demandé pourquoi… ?",
  );
  await amorce.check();
  await add(page, "Léa", "Bonjour. Voici notre sujet.");
  const text = page.getByRole("textbox", { name: "Réplique 1 de Léa" });
  await text.focus();
  await text.evaluate((t) => {
    t.setSelectionRange(8, 8);
    t.dispatchEvent(new Event("select", { bubbles: true }));
  });
  const firstReply = page.locator(".block").first();
  await btn(firstReply, "Diviser au curseur").click();
  await expect(page.locator(".block")).toHaveCount(2);
  await btn(firstReply, "Insérer après cette réplique").click();
  await page.getByRole("dialog").getByRole("button", { name: "Noah" }).click();
  const middle = page.getByRole("textbox", { name: "Réplique 2 de Noah" });
  await expect(middle).toBeFocused();
  await middle.fill("Alors ?");
  await middle.press("Home");
  await btn(page, "SOS rédaction").click();
  const sos = page.getByRole("dialog", { name: "SOS rédaction", exact: true });
  const reactTile = btn(sos, "Réagir et rebondir");
  await expect(sos.locator(".sos-tile")).toHaveCount(10);
  await reactTile.click();
  const phrases = page.getByRole("dialog", {
    name: "Réagir et rebondir",
    exact: true,
  });
  await expect(page.locator("dialog[open]")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(reactTile).toBeFocused();
  await reactTile.click();
  await btn(phrases, "Ah bon ? Je ne savais pas !").click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(middle).toHaveValue("Ah bon ? Je ne savais pas ! Alors ?");
  await btn(page, "Valider l’introduction et créer la première partie").click();
  await page.getByRole("button", { name: /Origines et histoire/ }).click();
  await page.getByRole("button", { name: /Chiffres et statistiques/ }).click();
  await page.getByLabel("Titre de la partie").fill("Le relief");
  await btn(page, "Valider les angles et rédiger la partie").click();
  await expect(guides.getByRole("checkbox")).toHaveCount(2);
  await expect(
    guides.getByRole("checkbox", { name: "Origines et histoire" }),
  ).not.toBeChecked();
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
  const typeSize = page.getByRole("combobox", { name: "Corps du texte" });
  for (const size of [11, 12, 13]) {
    await typeSize.selectOption(String(size));
    await expect(page.locator(".script").first()).toHaveAttribute(
      "style",
      new RegExp(size + "pt"),
    );
  }
  await btn(page, "Imprimer / Enregistrer en PDF").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await btn(page, "Revenir au script").click();
  await page.pdf({
    path: info.outputPath("scripts.pdf"),
    preferCSSPageSize: true,
    printBackground: true,
  });
  await page.reload();
  await btn(page, "Rejoindre le groupe").click();
  await btn(page, "Noah").click();
  await expect(amorce).toBeChecked();
  await btn(page, "La chronique est prête").click();
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
  await btn(page, "Pistes de rédaction").click();
  await expect(
    page.getByRole("heading", { name: "Pistes de rédaction" }),
  ).toBeInViewport();
  await expect(page.locator(".meter")).toContainText("100 %");
  const examples = page.getByRole("group", {
    name: "Exemples pour Amorce",
    exact: true,
  });
  await btn(examples, "Exemple suivant").click();
  await btn(examples, "Imaginez un instant…").click();
  await expect(
    page.getByRole("textbox", { name: "Réplique 1 de Ali" }),
  ).toHaveValue("À vous les studios ! Imaginez un instant…");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("Poignée à la souris et au clavier, réattribution et suppression directe", async ({
  page,
}) => {
  await create(page);
  await add(page, "Léa", "Première réplique.");
  await add(page, "Noah", "Deuxième réplique.");
  const cards = page.locator(".reply-list .block");
  const first = cards.first();
  const second = cards.last();
  await btn(first, "Réattribuer à…").click();
  await btn(
    page.getByRole("dialog", { name: "Réattribuer la réplique" }),
    "Noah",
  ).click();
  await expect(first.getByRole("textbox")).toHaveAccessibleName(
    "Réplique 1 de Noah",
  );
  const handle = btn(first, "Déplacer la réplique 1");
  await handle.scrollIntoViewIfNeeded();
  const start = await handle.boundingBox();
  const target = await second.boundingBox();
  const x = start.x + start.width / 2;
  await page.mouse.move(x, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, target.y + target.height * 0.8, { steps: 12 });
  await expect(second).toHaveAttribute("data-drop", "after");
  await page.mouse.up();
  await expect(first.getByRole("textbox")).toHaveValue("Deuxième réplique.");
  await btn(second, "Déplacer la réplique 2").press("ArrowUp");
  await expect(first.getByRole("textbox")).toHaveValue("Première réplique.");
  page.once("dialog", (dialog) => dialog.accept());
  await btn(first, "Supprimer la réplique").click();
  await expect(cards).toHaveCount(1);
  await btn(page, "Annuler ma modification").click();
  await expect(cards).toHaveCount(2);
  await expect(first.getByRole("textbox")).toHaveValue("Première réplique.");
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
  await btn(page, "La chronique est prête").click();
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

test("Micro refusé, annulation et acceptation explicite de la redictée", async ({
  page,
}) => {
  // Isolate the UI/media lifecycle. A separate measured benchmark exercises real Whisper.
  await page.addInitScript(() => {
    const RealWorker = window.Worker;
    window.Worker = class {
      constructor(url, ...args) {
        if (!String(url).includes("speech.worker"))
          return new RealWorker(url, ...args);
      }
      postMessage(msg) {
        if (msg.type === "load")
          queueMicrotask(() =>
            this.onmessage({ data: { type: "ready", ms: 1 } }),
          );
        else
          queueMicrotask(() =>
            this.onmessage({
              data: { type: "result", text: "Nouvelle phrase.", ms: 1 },
            }),
          );
      }
      terminate() {}
    };
    let attempt = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      if (!attempt++)
        throw new DOMException("Permission refusée", "NotAllowedError");
      const ctx = new AudioContext(),
        dest = ctx.createMediaStreamDestination(),
        osc = ctx.createOscillator();
      osc.connect(dest);
      osc.start();
      await ctx.resume();
      return dest.stream;
    };
  });
  await create(page);
  await add(page, "Léa", "Texte à conserver.");
  const box = page.getByRole("textbox", { name: "Réplique 1 de Léa" });
  await box.focus();
  await btn(page, "Redicter").click();
  await expect(page.locator(".speechstate")).toContainText(
    "Microphone indisponible",
  );
  await expect(box).toHaveValue("Texte à conserver.");
  for (const accept of [false, true]) {
    await btn(page, "Redicter").click();
    await expect(page.locator(".blocktools")).toContainText("1 s", {
      timeout: 6000,
    });
    await btn(page, "Arrêter et transcrire").click();
    await expect(page.locator(".blocktools blockquote")).toHaveText(
      "Nouvelle phrase.",
    );
    await expect(box).toHaveValue("Texte à conserver.");
    await btn(page, accept ? "Accepter la transcription" : "Annuler").click();
  }
  await expect(box).toHaveValue("Nouvelle phrase.");
});
