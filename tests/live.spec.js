import { test, expect } from "@playwright/test";

// Opt-in: creates a single fictitious room on the configured Supabase project.
test("Deux navigateurs, coupure, reprise et conflit sur une même réplique", async ({
  browser,
  baseURL,
}) => {
  test.skip(
    !process.env.RADIO_LIVE_TEST,
    "Nécessite un projet Supabase dédié.",
  );
  test.setTimeout(125000);
  const left = await browser.newContext(),
    right = await browser.newContext();
  try {
    for (const context of [left, right])
      await context.route("https://huggingface.co/**", (r) => r.abort());
    const a = await left.newPage(),
      b = await right.newPage();
    const btn = (p, name) => p.getByRole("button", { name, exact: true });
    await a.goto(baseURL);
    await btn(a, "Créer une chronique").click();
    await a
      .getByLabel("Sujet de la chronique")
      .fill("Recette technique · personnages fictifs");
    await a.getByLabel("Prénom 1").fill("Voix A");
    await a.getByLabel("Prénom 2").fill("Voix B");
    await btn(a, "Ouvrir l’introduction").click();
    await expect(a.locator(".code")).toBeVisible();
    const code = await a.locator(".code").innerText();
    await b.goto(baseURL);
    await btn(b, "Rejoindre une chronique").click();
    await b.getByLabel("Code de la chronique").fill(code);
    await btn(b, "Ouvrir la chronique").click();
    await btn(b, "Voix B").click();
    await a.locator(".addline button").first().click();
    await expect(b.locator(".block textarea")).toHaveCount(1, {
      timeout: 25000,
    });
    await b.locator(".addline button").last().click();
    await expect(a.locator(".block textarea")).toHaveCount(2, {
      timeout: 25000,
    });
    const aa = a.locator(".block textarea").first(),
      ab = a.locator(".block textarea").last(),
      ba = b.locator(".block textarea").first(),
      bb = b.locator(".block textarea").last();
    await Promise.all([aa.fill("Version A"), bb.fill("Version B")]);
    await expect(ba).toHaveValue("Version A", { timeout: 25000 });
    await expect(ab).toHaveValue("Version B", { timeout: 25000 });
    await right.setOffline(true);
    await ba.fill("Brouillon hors ligne");
    await expect(b.locator(".save")).toContainText("Hors connexion");
    await aa.fill("Texte du groupe");
    await expect(a.locator(".save")).toHaveText("Sauvegardé", {
      timeout: 15000,
    });
    await right.setOffline(false);
    await b
      .getByRole("button", { name: /Comparer et récupérer/ })
      .click({ timeout: 30000 });
    await expect(b.getByRole("dialog")).toContainText("Brouillon hors ligne");
    await expect(b.getByRole("dialog")).toContainText("Texte du groupe");
    await btn(b, "Reprendre mon texte ici").click();
    await expect(aa).toHaveValue("Brouillon hors ligne", { timeout: 25000 });
  } finally {
    await left.close();
    await right.close();
  }
});
