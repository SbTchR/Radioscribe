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
  await expect(page.locator(".save")).toHaveText("Sauvegardé");
}

async function joinGroup(page, baseURL, code, name) {
  await page.goto(baseURL);
  await button(page, "Rejoindre par un code").click();
  await page
    .getByLabel("Code de la chronique ou de l’animation")
    .fill(code.toLowerCase());
  await button(page, "Rejoindre le groupe").click();
  await button(page, name).click();
}

test("Émission à quatre, échanges de groupe, notifications et animation", async ({
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
  const teammate = await browser.newContext();
  const recovery = await browser.newContext();
  const betterTranscription = "Meilleure transcription (mais plus lente)";
  const chronicleLabel = "Chronique 1 : Le relief";
  const musicLabel = "Musique 0 : « Morceau de test » de Groupe de test";
  try {
    for (const context of [teacher, teammate]) {
      await context.route("https://huggingface.co/**", (route) =>
        route.abort(),
      );
    }
    const prof = await teacher.newPage();
    const pupil = await student.newPage();
    const partner = await teammate.newPage();
    const pageErrors = [];
    for (const page of [prof, pupil, partner])
      page.on("pageerror", (error) => pageErrors.push(error.message));
    // Use real browser audio capture with a predictable worker result.
    await pupil.addInitScript(() => {
      const RealWorker = window.Worker;
      window.Worker = class {
        constructor(url, ...args) {
          if (!String(url).includes("speech.worker"))
            return new RealWorker(url, ...args);
        }
        postMessage(msg) {
          const data =
            msg.type === "load"
              ? { type: "ready", ms: 1 }
              : { type: "result", text: "Peux-tu relire l’intro ?", ms: 1 };
          queueMicrotask(() => this.onmessage({ data }));
        }
        terminate() {}
      };
      navigator.mediaDevices.getUserMedia = async () => {
        const ctx = new AudioContext();
        const output = ctx.createMediaStreamDestination();
        const oscillator = ctx.createOscillator();
        oscillator.connect(output);
        oscillator.start();
        await ctx.resume();
        return output.stream;
      };
    });
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
    await prof.getByLabel("Thème de la chronique").fill("Le relief");
    await prof.getByLabel("Prénoms de l’équipe").fill("Alice\nBenoît");
    await button(prof, "Enregistrer les modifications").click();
    await expect(cue(prof, chronicleLabel)).toContainText("Alice, Benoît");
    const code = (
      await button(prof, "Copier le code de Chronique 1").textContent()
    ).trim();
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{5}$/);

    await button(prof, "Modifier Musique 0").click();
    await prof.getByLabel("Titre du morceau").fill("Morceau de test");
    await prof.getByLabel("Artiste").fill("Groupe de test");
    await prof.getByLabel("Minutes").fill("2");
    await prof.getByLabel("Secondes").fill("5");
    await button(prof, "Enregistrer les modifications").click();
    await expect(cue(prof, musicLabel)).toContainText("2 min 05 s");
    await button(prof, "Modifier Musique 0").click();
    await expect(prof.getByLabel("Titre du morceau")).toHaveValue(
      "Morceau de test",
    );
    await expect(prof.getByLabel("Artiste")).toHaveValue("Groupe de test");
    await button(prof.getByRole("dialog"), "Fermer").click();

    await button(prof, "Ajouter une partie").click();
    await prof.getByLabel("Type de partie").selectOption("music");
    await prof.getByLabel("Titre du morceau").fill("Les Champs Elysées");
    await prof.getByLabel("Artiste").fill("Joe Dassin");
    await prof
      .getByRole("combobox", { name: "Insérer", exact: true })
      .selectOption({ label: "Après " + musicLabel });
    await button(prof, "Ajouter au conducteur").click();
    await expect(prof.locator(".cue-card").nth(3)).toContainText(
      "Musique 5 : « Les Champs Elysées » de Joe Dassin",
    );
    await button(prof, "Descendre Musique 5").click();
    await expect(prof.locator(".cue-card").nth(4)).toContainText(
      "Musique 5 : « Les Champs Elysées » de Joe Dassin",
    );
    await button(prof, "Retirer Musique 5").click();
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
    await button(prof, "Messages à l’équipe").click();
    await prof
      .getByLabel("Ton message")
      .fill("Retour réservé au deuxième groupe.");
    await button(prof, "Envoyer le message").click();
    await expect(prof.getByRole("dialog").locator(".message")).toContainText(
      "Retour réservé au deuxième groupe.",
    );
    await button(prof.getByRole("dialog"), "Fermer").click();
    await button(prof, "Conducteur de l’émission").click();

    await joinGroup(pupil, baseURL, code, "Alice");
    await joinGroup(partner, baseURL, code, "Benoît");
    await button(pupil, "Réglages").click();
    const pupilSettings = pupil.getByRole("dialog", {
      name: "Réglages de l’atelier",
    });
    await expect(
      pupilSettings.getByLabel("Vitesse de lecture (mots/minute)"),
    ).toHaveCount(0);
    await expect(
      pupilSettings.getByLabel("Modèle de transcription").locator("option"),
    ).toHaveText(["Bon et lent", "Moyen et moyen", "Moins bon et rapide"]);
    await button(pupilSettings, "Fermer").click();
    await expect(pupil.locator(".speechstate")).toContainText("Bon et lent");
    await expect(button(pupil, betterTranscription)).toHaveCount(0);
    await button(pupil, "Transcription trop lente / bug").click();
    await expect(pupil.locator(".speechstate")).toContainText("Moyen et moyen");
    await button(pupil, betterTranscription).click();
    await expect(pupil.locator(".speechstate")).toContainText("Bon et lent");
    await button(pupil, "Transcription trop lente / bug").click();
    await writeReply(
      pupil,
      "Alice",
      "Bonjour, nous parlons de la formation des montagnes.",
    );
    await button(pupil, "Modifier le prénom de Alice").click();
    await pupil.getByLabel("Prénom", { exact: true }).fill("Alicia");
    await button(pupil, "Enregistrer le prénom").click();
    await expect(pupil.locator(".save")).toHaveText("Sauvegardé");
    await expect(
      pupil.getByRole("textbox", { name: "Réplique 1 de Alicia" }),
    ).toHaveValue("Bonjour, nous parlons de la formation des montagnes.");
    await expect(cue(prof, chronicleLabel)).toContainText("Alicia, Benoît", {
      timeout: 22000,
    });
    await expect(cue(prof, chronicleLabel)).toContainText("En rédaction", {
      timeout: 22000,
    });
    await expect(cue(prof, chronicleLabel)).toContainText("0 min 03 s");

    await button(prof, "Rédiger Chronique 1").click();
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
    await expect(
      prof.getByRole("dialog").locator(".feedback-list"),
    ).toContainText("Pensez à vérifier vos chiffres");
    await button(prof.getByRole("dialog"), "Fermer").click();
    await button(prof, "Conducteur de l’émission").click();

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

    await button(pupil.locator(".reply-comments"), "Répondre").click();
    await pupil.getByLabel("Ta réponse").fill("Nous avons choisi le Cervin.");
    await button(pupil, "Envoyer la réponse").click();
    await expect(
      pupil.getByRole("dialog").locator(".message-replies"),
    ).toContainText("Nous avons choisi le Cervin.");
    await button(pupil.getByRole("dialog"), "Fermer").click();

    await button(pupil, "Messages du groupe").click();
    const pupilDiscussion = pupil.getByRole("dialog");
    await expect(pupilDiscussion).toContainText(
      "Le groupe et l’enseignant peuvent lire tous ces échanges",
    );
    await expect(pupilDiscussion).not.toContainText(
      "Retour réservé au deuxième groupe.",
    );
    await pupilDiscussion
      .getByLabel("Destinataire")
      .selectOption({ label: "À Benoît" });
    await button(pupilDiscussion, "Transcription trop lente / bug").click();
    await expect(
      pupilDiscussion.locator(".message-dictation-status"),
    ).toContainText("Moins bon et rapide");
    await button(pupilDiscussion, betterTranscription).click();
    await expect(
      pupilDiscussion.locator(".message-dictation-status"),
    ).toContainText("Moyen et moyen");
    await button(pupilDiscussion, "Transcription trop lente / bug").click();
    await button(pupilDiscussion, "Dicter le message").click();
    await expect(
      pupilDiscussion.locator(".message-dictation-status"),
    ).toContainText("1 s", { timeout: 6000 });
    await button(pupilDiscussion, "Arrêter et transcrire").click();
    await expect(pupilDiscussion.locator(".message-transcript")).toContainText(
      "Peux-tu relire l’intro ?",
    );
    await expect(pupilDiscussion.getByLabel("Ton message")).toHaveValue("");
    await expect(button(pupilDiscussion, "Envoyer le message")).toBeDisabled();
    await button(pupilDiscussion, "Utiliser cette transcription").click();
    await expect(pupilDiscussion.getByLabel("Ton message")).toHaveValue(
      "Peux-tu relire l’intro ?",
    );
    await pupilDiscussion
      .getByLabel("Ton message")
      .fill("Peux-tu relire notre introduction ?");
    await button(pupilDiscussion, "Envoyer le message").click();
    await expect(pupilDiscussion.locator(".feedback-list")).toContainText(
      "Peux-tu relire notre introduction ?",
    );

    await button(partner, "Messages du groupe").click();
    const partnerThread = partner
      .locator(".feedback-list > li")
      .filter({ hasText: "Peux-tu relire notre introduction ?" });
    await expect(partnerThread).toContainText("Alicia", { timeout: 25000 });
    await expect(partnerThread).toContainText("→ Benoît");
    await expect(button(partnerThread, "Modifier le message")).toHaveCount(0);
    await expect(button(partnerThread, "Supprimer le message")).toHaveCount(0);
    await button(partnerThread, "Répondre").click();
    await partnerThread
      .getByLabel("Ta réponse")
      .fill("Je la relis maintenant.");
    await button(partnerThread, "Envoyer la réponse").click();
    await expect(partnerThread.locator(".message-replies")).toContainText(
      "Je la relis maintenant.",
    );

    const directThread = (dialog) =>
      dialog
        .locator(".feedback-list > li")
        .filter({ hasText: "Je la relis maintenant." });
    const pupilThread = directThread(pupilDiscussion);
    await button(pupilThread, "Modifier le message").click({ timeout: 25000 });
    const edited = pupilThread.getByRole("textbox", {
      name: "Modifier le message",
    });
    await expect(edited).toHaveValue("Peux-tu relire notre introduction ?");
    await edited.fill("Peux-tu relire toute notre introduction ?");
    await button(pupilThread, "Enregistrer le message").click();
    const partnerDiscussion = partner.getByRole("dialog");
    await expect(directThread(partnerDiscussion)).toContainText(
      "Peux-tu relire toute notre introduction ?",
      { timeout: 25000 },
    );
    await expect(directThread(partnerDiscussion)).toContainText("Modifié");

    const notice = button(cue(prof, chronicleLabel), "3 nouveaux messages");
    await expect(notice).toBeVisible({ timeout: 25000 });
    await notice.scrollIntoViewIfNeeded();
    await prof.screenshot({ path: info.outputPath("nouveaux-messages.png") });
    await notice.click();
    const teacherDiscussion = prof.getByRole("dialog", {
      name: "Messages à l’équipe",
    });
    await expect(teacherDiscussion).toContainText(
      "Peux-tu relire toute notre introduction ?",
    );
    await expect(teacherDiscussion).toContainText("Je la relis maintenant.");
    const comment = teacherDiscussion
      .locator(".feedback-list > li")
      .filter({ hasText: "Nous avons choisi le Cervin." });
    await button(comment, "Modifier le commentaire").click();
    await comment
      .getByRole("textbox", { name: "Modifier le commentaire" })
      .fill("Précisez où se trouve le Cervin.");
    await button(comment, "Enregistrer le commentaire").click();
    await expect(pupilDiscussion).toContainText(
      "Précisez où se trouve le Cervin.",
      { timeout: 25000 },
    );
    await button(comment, "Supprimer le commentaire").click();
    await expect(
      button(teacherDiscussion, "Confirmer la suppression"),
    ).toHaveCount(0);
    await expect(pupilDiscussion).toContainText("Commentaire supprimé", {
      timeout: 25000,
    });
    await expect(pupilDiscussion).not.toContainText(
      "Précisez où se trouve le Cervin.",
    );
    await expect(pupilDiscussion).toContainText("Nous avons choisi le Cervin.");
    const teacherThread = directThread(teacherDiscussion);
    await expect(button(teacherThread, "Modifier le message")).toHaveCount(0);
    await button(pupilThread, "Supprimer le message").click();
    await expect(pupilThread).toContainText(
      "Peux-tu relire toute notre introduction ?",
    );
    await button(pupilThread, "Confirmer la suppression").click();
    await expect(teacherThread).toContainText("Message supprimé", {
      timeout: 25000,
    });
    await expect(teacherThread).not.toContainText(
      "Peux-tu relire toute notre introduction ?",
    );
    await button(teacherThread, "Supprimer le message").click();
    await expect(
      button(teacherDiscussion, "Confirmer la suppression"),
    ).toHaveCount(0);
    await expect(directThread(partnerDiscussion)).toHaveCount(0, {
      timeout: 25000,
    });
    await pupil.setViewportSize({ width: 390, height: 844 });
    expect(
      await pupilDiscussion.evaluate(
        (dialog) => dialog.scrollWidth <= dialog.clientWidth,
      ),
    ).toBe(true);
    await pupil.screenshot({ path: info.outputPath("discussion-mobile.png") });
    await button(pupilDiscussion, "Fermer").click();

    await button(pupil, "Conducteur de l’émission").click();
    await expect(button(pupil, "Ajouter une partie")).toHaveCount(0);
    await expect(cue(pupil, musicLabel)).toBeVisible();
    await expect(button(pupil, "Modifier Musique 0")).toHaveCount(0);
    await expect(pupil.locator(".cue-code")).toHaveCount(1);
    await expect(pupil.locator(".cue-unread")).toHaveCount(0);
    await button(pupil, "Consulter Chronique 2").click();
    await expect(
      pupil.getByText("Lecture seule", { exact: true }),
    ).toBeVisible();
    await expect(
      pupil.getByText("Voici le texte du deuxième groupe."),
    ).toBeVisible();
    await expect(pupil.getByRole("textbox")).toHaveCount(0);
    await expect(
      pupil.getByText("Retour réservé au deuxième groupe."),
    ).toHaveCount(0);
    await expect(button(pupil, "Messages du groupe")).toHaveCount(0);
    await button(pupil, "Conducteur de l’émission").click();
    await expect(button(pupil, "Rédiger Chronique 1")).toBeVisible();
    await pupil.setViewportSize({ width: 390, height: 844 });
    expect(
      await pupil.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);

    await button(prof.getByRole("dialog"), "Fermer").click();
    await button(prof, "Conducteur de l’émission").click();
    await expect(cue(prof, chronicleLabel).locator(".cue-unread")).toHaveCount(
      0,
    );
    await button(prof, "Rédiger Prise d’antenne").click();
    await button(prof, "Réglages").click();
    const teacherSettings = prof.getByRole("dialog", {
      name: "Réglages de l’atelier",
    });
    const teacherSpeed = teacherSettings.getByLabel(
      "Vitesse de lecture (mots/minute)",
    );
    await expect(teacherSpeed).toHaveValue("170");
    await teacherSpeed.fill("150");
    await button(teacherSettings, "Appliquer au projet").click();
    await expect(prof.locator(".save")).toHaveText("Sauvegardé");
    await button(prof, "Réglages").click();
    await expect(teacherSpeed).toHaveValue("150");
    await button(teacherSettings, "Fermer").click();
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
    await button(prof, "Modifier le prénom de Animateur 1").click();
    await prof.getByLabel("Prénom", { exact: true }).fill("Maya");
    await button(prof, "Enregistrer le prénom").click();
    await expect(prof.locator(".save")).toHaveText("Sauvegardé");
    await button(prof, "Valider la séquence et relire le script").click();
    await expect(
      prof.getByRole("heading", { name: "Relecture du script" }),
    ).toBeVisible();
    await expect(prof.locator(".line")).toContainText("Maya");
    expect(
      parseFloat(
        await prof
          .locator(".checklist label")
          .first()
          .evaluate((el) => getComputedStyle(el).fontSize),
      ),
    ).toBeGreaterThanOrEqual(17);
    expect(pageErrors).toEqual([]);
  } finally {
    await teacher.close();
    await student.close();
    await teammate.close();
    await recovery.close();
  }
});
