// Szablony e-maili i transporty (spec #17 Q2, Risks „Sensitive data”; lib/email/templates.mjs, transport.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { EMAIL_TEMPLATES, renderEmail } from "../../lib/email/templates.mjs";
import { createLogTransport, createMemoryTransport, transportFromEnv } from "../../lib/email/transport.mjs";

const SAMPLE = {
  amount: "150,00 PLN",
  mentorName: "Jan Kowalski",
  menteeName: "Anna",
  when: "wtorek, 15 stycznia 2030, 10:00",
  decideBy: "wtorek, 15 stycznia 2030, 09:00",
  lengthMinutes: 25,
  requestUrl: "https://devmentor.example/r/TOKEN_PLACEHOLDER",
  requestLink: "https://devmentor.example/m/zapytania/ID_PLACEHOLDER",
};

const SECRET_QUESTION = "SEKRETNE PYTANIE o hasło do bazy produkcyjnej";
const EMOJI = /\p{Extended_Pictographic}/u;

test("lista szablonów nie jest pusta", () => {
  assert.ok(EMAIL_TEMPLATES.length >= 5);
});

test("każdy szablon renderuje temat i tekst z przykładowymi parametrami", () => {
  for (const name of EMAIL_TEMPLATES) {
    const { subject, text } = renderEmail(name, SAMPLE);
    assert.ok(subject.trim().length > 0, `${name}: temat`);
    assert.ok(text.trim().length > 0, `${name}: tekst`);
    assert.ok(!text.includes("undefined") && !subject.includes("undefined"), `${name}: undefined`);
  }
});

test("szablony działają też bez parametrów (brak wartości → pusty napis, nie wyjątek)", () => {
  for (const name of EMAIL_TEMPLATES) {
    const { subject, text } = renderEmail(name, undefined);
    assert.ok(subject.length > 0 && text.length > 0, name);
    assert.ok(!text.includes("undefined") && !text.includes("null"), name);
  }
});

test("żaden szablon nie zawiera treści pytania, nawet gdy trafi do parametrów (R04, A08)", () => {
  for (const name of EMAIL_TEMPLATES) {
    const { subject, text } = renderEmail(name, { ...SAMPLE, question: SECRET_QUESTION, questionText: SECRET_QUESTION });
    assert.ok(!subject.includes("SEKRETNE"), `${name}: temat`);
    assert.ok(!text.includes("SEKRETNE"), `${name}: tekst`);
  }
});

test("żaden szablon nie zawiera wykrzyknika ani emoji", () => {
  for (const name of EMAIL_TEMPLATES) {
    const { subject, text } = renderEmail(name, SAMPLE);
    for (const output of [subject, text]) {
      assert.ok(!output.includes("!"), `${name}: wykrzyknik`);
      assert.ok(!EMOJI.test(output), `${name}: emoji`);
    }
  }
});

test("nieznany szablon rzuca błąd o nazwie UnknownTemplate", () => {
  assert.throws(
    () => renderEmail("nie_ma_takiego", SAMPLE),
    (error) => error instanceof Error && error.name === "UnknownTemplate",
  );
});

test("transportFromEnv bez SMTP_URL (albo z samymi spacjami) → log", () => {
  assert.equal(transportFromEnv({}).kind, "log");
  assert.equal(transportFromEnv({ SMTP_URL: "   " }).kind, "log");
});

test("transportFromEnv: SMTP_URL bez EMAIL_FROM rzuca błąd (bez ujawniania adresu SMTP)", () => {
  const url = "smtp://uzytkownik:HASLO_PLACEHOLDER@smtp.example:587";
  assert.throws(
    () => transportFromEnv({ SMTP_URL: url }),
    (error) => error instanceof Error && !error.message.includes("HASLO_PLACEHOLDER"),
  );
  assert.throws(() => transportFromEnv({ SMTP_URL: url, EMAIL_FROM: "  " }));
});

test("transportFromEnv: SMTP_URL z EMAIL_FROM → smtp (bez łączenia przy tworzeniu)", () => {
  const { kind, transport } = transportFromEnv({ SMTP_URL: "smtp://smtp.example:587", EMAIL_FROM: "DevMentor <noreply@example.com>" });
  assert.equal(kind, "smtp");
  assert.equal(typeof transport.send, "function");
});

test("transport pamięciowy zbiera wiadomości w kolejności wysyłki", async () => {
  const transport = createMemoryTransport();
  await transport.send({ to: "a@example.com", subject: "Pierwszy", text: "tekst 1" });
  await transport.send({ to: "b@example.com", subject: "Drugi", text: "tekst 2" });
  assert.deepEqual(transport.messages, [
    { to: "a@example.com", subject: "Pierwszy", text: "tekst 1" },
    { to: "b@example.com", subject: "Drugi", text: "tekst 2" },
  ]);
});

test("transport log w produkcji loguje tylko adresata i temat, bez treści", async () => {
  const lines = [];
  const transport = createLogTransport({ log: { info: (line) => lines.push(String(line)) }, production: true });
  await transport.send({ to: "jan@example.com", subject: "Temat wiadomości", text: "TREŚĆ Z LINKIEM /r/TOKEN_PLACEHOLDER" });
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes("jan@example.com"));
  assert.ok(lines[0].includes("Temat wiadomości"));
  assert.ok(!lines[0].includes("TOKEN_PLACEHOLDER"));
  assert.ok(!lines[0].includes("TREŚĆ"));
});

test("transport log poza produkcją loguje też treść (lokalne QA)", async () => {
  const lines = [];
  const transport = createLogTransport({ log: { info: (line) => lines.push(String(line)) }, production: false });
  await transport.send({ to: "jan@example.com", subject: "Temat", text: "TREŚĆ_LOKALNA" });
  assert.ok(lines[0].includes("TREŚĆ_LOKALNA"));
});
