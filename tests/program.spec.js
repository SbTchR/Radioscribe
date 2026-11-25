import { expect, test } from "@playwright/test";

const button = (scope, name) =>
  scope.getByRole("button", { name, exact: true });
const cue = (page, title) =>
  page
    .locator(".cue-card")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });

async function writeReply(page, speaker, text) {
  await page.locator(".addline").getByRole("button", { name: speaker }).click();
  const card = page.locator(".block").last();
  await expect(card.getByRole("textbox")).toBeFocused();
  await card.getByRole("textbox").fill(text);
  await button(card, "Valider la réplique").click();
  await expect(page.locator(".save")).toHaveText("Sauvegardé");
}

test("Émission à quatre, lecture seule des autres groupes, animation et retours", async ({
  browser,
  baseURL,
}, info) => {
  test.skip(
    !process.env.RADIO_LIVE_TEST,
    "Nécessite le projet Supabase de Radioscribe.",
  );
  test.setTimeout(170000);
  const teacher = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const student = await browser.newContext();
  const recovery = await browser.newContext();
  try {
    for (const context of [teacher, student]) {
      await context.route("https://huggingface.co/**", (route) =>
        route.abort(),
      );
    }
    const prof = await teacher.newPage();
    const pupil = await student.newPage();
    prof.setDefaultTimeout(12000);
    pupil.setDefaultTimeout(12000);
    await prof.goto(baseURL);
    await button(prof, "Créer une émission").click();
    await prof
      .getByLabel("Titre de l’émission")
      .fill("Émission fictive de recette");
    await prof.getByLabel("Nombre de chroniques").fill("4");
    await expect(
      prof.getByRole("checkbox", { name: "Avec animation" }),
    ).toBeChecked();
    await button(prof, "Créer le conducteur").click();
    await expect(prof.locator(".cue-card")).toHaveCount(18);
    await expect(prof.locator(".cue-card").nth(9)).toContainText(
      "Jingle intermédiaire",
    );

    await button(prof, "Lien de gestion").click();
    await button(prof, "Copier le lien de gestion").click();
    await expect(prof.getByRole("dialog")).toHaveCount(0);
    const privateLink = await prof.evaluate(() =>
      navigator.clipboard.readText(),
    );
    expect(new URL(privateLink).hash.startsWith("#regie=")).toBe(true);
    const secondTeacher = await recovery.newPage();
    await secondTeacher.goto(privateLink);
    await expect(button(secondTeacher, "Lien de gestion")).toBeVisible();
    await expect(secondTeacher.locator(".cue-card")).toHaveCount(18);
    expect(new URL(secondTeacher.url()).hash.startsWith("#emission=")).toBe(
      true,
    );

    await button(prof, "Modifier Chronique 1").click();
    await prof.getByLabel("Sujet de la chronique").fill("Le relief");
    await prof.getByLabel("Prénoms de l’équipe").fill("Alice\nBenoît");
    await button(prof, "Enregistrer les modifications").click();
    await expect(cue(prof, "Le relief")).toContainText("Alice, Benoît");
    const code = (
      await button(prof, "Copier le code de Le relief").textContent()
    ).trim();
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{5}$/);

    await button(prof, "Modifier Musique 0").click();
    await prof.getByLabel("Nom de la partie").fill("Morceau de test");
    await prof.getByLabel("Minutes").fill("2");
    await prof.getByLabel("Secondes").fill("5");
    await button(prof, "Enregistrer les modifications").click();
    await expect(cue(prof, "Morceau de test")).toContainText("2 min 05 s");

    await button(prof, "Ajouter une partie").click();
    await prof.getByLabel("Type de partie").selectOption("jingle");
    await prof.getByLabel("Nom de la partie").fill("Jingle ajouté");
    await prof
      .getByRole("combobox", { name: "Insérer", exact: true })
      .selectOption({ label: "Après Morceau de test" });
    await button(prof, "Ajouter au conducteur").click();
    await expect(prof.locator(".cue-card").nth(3)).toContainText(
      "Jingle ajouté",
    );
    await button(prof, "Descendre Jingle ajouté").click();
    await expect(prof.locator(".cue-card").nth(4)).toContainText(
      "Jingle ajouté",
    );
    await button(prof, "Retirer Jingle ajouté").click();
    await button(prof, "Retirer du conducteur").click();
    await expect(prof.locator(".cue-card")).toHaveCount(18);
    await prof.evaluate(() => window.scrollTo(0, 0));
    await prof.screenshot({ path: info.outputPath("conducteur.png") });

    await button(prof, "Rédiger Chronique 2").click();
    await writeReply(
      prof,
      "Chroniqueur 1",
      "Voici le texte du deuxième groupe.",
    );
    await button(prof, "Conducteur de l’émission").click();

    await pupil.goto(baseURL);
    await button(pupil, "Rejoindre par un code").click();
    await pupil
      .getByLabel("Code de la chronique ou de l’animation")
      .fill(code.toLowerCase());
    await button(pupil, "Rejoindre le groupe").click();
    await button(pupil, "Alice").click();
    await expect(pupil.locator(".meter")).toContainText("170 mots/min");
    await writeReply(
      pupil,
      "Alice",
      "Bonjour, nous parlons de la formation des montagnes.",
    );
    await expect(cue(prof, "Le relief")).toContainText("En rédaction", {
      timeout: 22000,
    });
    await expect(cue(prof, "Le relief")).toContainText("0 min 03 s");

    await button(prof, "Rédiger Le relief").click();
    await button(prof, "Commenter la réplique 1").click();
    await prof
      .getByLabel("Ton commentaire")
      .fill("Ajoute un exemple de montagne.");
    await button(prof, "Envoyer le commentaire").click();
    await expect(prof.getByRole("dialog")).toContainText(
      "Ajoute un exemple de montagne.",
    );
    await button(prof.getByRole("dialog"), "Fermer").click();
    await button(prof, "Messages à l’équipe").click();
    await prof
      .getByLabel("Ton message")
      .fill("Pensez à vérifier vos chiffres avant l’enregistrement.");
    await prof
      .getByRole("checkbox", { name: "Marquer comme important" })
      .check();
    await button(prof, "Envoyer le message").click();

    await expect(pupil.locator(".reply-comments")).toContainText(
      "Ajoute un exemple de montagne.",
      { timeout: 25000 },
    );
    await expect(pupil.locator(".feedback-alert")).toContainText(
      "Pensez à vérifier vos chiffres",
      { timeout: 25000 },
    );
    await button(pupil, "Lire les messages").click();
    await button(pupil, "Marquer les alertes comme lues").click();
    await expect(pupil.locator(".feedback-alert")).toHaveCount(0);
    await button(pupil.getByRole("dialog"), "Fermer").click();

    await button(pupil, "Conducteur de l’émission").click();
    await expect(button(pupil, "Ajouter une partie")).toHaveCount(0);
    await expect(pupil.locator(".cue-code")).toHaveCount(1);
    await button(pupil, "Consulter Chronique 2").click();
    await expect(
      pupil.getByText("Lecture seule", { exact: true }),
    ).toBeVisible();
    await expect(
      pupil.getByText("Voici le texte du deuxième groupe."),
    ).toBeVisible();
    await expect(pupil.getByRole("textbox")).toHaveCount(0);
    await button(pupil, "Conducteur de l’émission").click();
    await expect(button(pupil, "Rédiger Le relief")).toBeVisible();
    await pupil.setViewportSize({ width: 390, height: 844 });
    expect(
      await pupil.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);

    await button(prof.getByRole("dialog"), "Fermer").click();
    await button(prof, "Conducteur de l’émission").click();
    await button(prof, "Rédiger Prise d’antenne").click();
    await expect(
      prof.getByRole("checkbox", { name: "Amorce de l’émission", exact: true }),
    ).toBeVisible();
    await expect(
      prof.getByRole("checkbox", {
        name: "Quelques indices pour créer le suspense",
        exact: true,
      }),
    ).toBeVisible();
    await expect(button(prof, "SOS rédaction")).toBeVisible();
    await expect(
      prof.getByRole("button", { name: /créer la première partie/i }),
    ).toHaveCount(0);
    await writeReply(prof, "Animateur 1", "Bonsoir à toutes et tous !");
    await button(prof, "Valider la séquence et relire le script").click();
    await expect(
      prof.getByRole("heading", { name: "Relecture du script" }),
    ).toBeVisible();
  } finally {
    await teacher.close();
    await student.close();
    await recovery.close();
  }
});
