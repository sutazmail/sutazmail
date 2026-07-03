"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/session";
import {
  addAccount,
  addAlias,
  deleteAccount,
  deleteAlias,
  generateDkim,
  updateAccountPassword,
} from "@/server/mailserver";
import { assertDomain } from "@/server/validate";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { setSettings, SETTINGS_FIELDS, type AppSettings } from "@/server/settings";
import {
  addDnsRecord,
  deleteDnsRecord,
  resetDnsRecords,
  updateDnsRecord,
} from "@/server/dns-records";
import { deleteManagedDomain } from "@/server/domains";

export type ActionResult = { ok: true } | { ok: false; error: string };

function fail(err: unknown): ActionResult {
  return { ok: false, error: err instanceof Error ? err.message : "Unexpected error" };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function addAccountAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  try {
    await addAccount(email, password);
    // Portal identity: login requires a User row (Dovecot only checks the password).
    // Created when the mailbox's domain is registered; upsert keeps this idempotent.
    const domainName = email.split("@")[1]?.toLowerCase();
    const domain = domainName
      ? await prisma.domain.findUnique({ where: { name: domainName } })
      : null;
    if (domain) {
      await prisma.user.upsert({
        where: { email: email.toLowerCase() },
        update: {},
        create: { email: email.toLowerCase(), role: "USER", orgId: domain.orgId },
      });
    }
    revalidatePath("/accounts");
    revalidatePath("/");
    revalidatePath("/domains");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function updatePasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  try {
    await updateAccountPassword(email, password);
    revalidatePath("/accounts");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteAccountAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const email = String(formData.get("email") ?? "").trim();
  try {
    await deleteAccount(email);
    revalidatePath("/accounts");
    revalidatePath("/");
    revalidatePath("/domains");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function addAliasAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const source = String(formData.get("source") ?? "").trim();
  const recipient = String(formData.get("recipient") ?? "").trim();
  try {
    await addAlias(source, recipient);
    revalidatePath("/aliases");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteAliasAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const source = String(formData.get("source") ?? "").trim();
  const recipient = String(formData.get("recipient") ?? "").trim();
  try {
    await deleteAlias(source, recipient);
    revalidatePath("/aliases");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Save editable app settings (mail profile, webmail URL, DNS templates). */
export async function saveSettingsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireAdmin();
  const patch: Partial<AppSettings> = {};
  for (const field of SETTINGS_FIELDS) {
    const raw = formData.get(field);
    if (typeof raw === "string") patch[field] = raw;
  }
  try {
    await setSettings(patch);
    await audit("settings.update", "app", { actorId: ctx.user.id, detail: { fields: Object.keys(patch) } });
    revalidatePath("/settings");
    revalidatePath("/domains");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Add a DNS record to a domain (forks it off the global templates on first edit). */
export async function addDnsRecordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireAdmin();
  const domain = String(formData.get("domain") ?? "").trim().toLowerCase();
  const rec = {
    type: String(formData.get("type") ?? ""),
    host: String(formData.get("host") ?? ""),
    value: String(formData.get("value") ?? ""),
  };
  try {
    await addDnsRecord(domain, rec);
    await audit("dns.add", domain, { actorId: ctx.user.id, detail: rec });
    revalidatePath("/domains");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Change an existing (or template-backed) DNS record. */
export async function updateDnsRecordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireAdmin();
  const domain = String(formData.get("domain") ?? "").trim().toLowerCase();
  const recordId = String(formData.get("recordId") ?? "");
  const rec = {
    type: String(formData.get("type") ?? ""),
    host: String(formData.get("host") ?? ""),
    value: String(formData.get("value") ?? ""),
  };
  try {
    await updateDnsRecord(domain, recordId, rec);
    await audit("dns.update", domain, { actorId: ctx.user.id, detail: rec });
    revalidatePath("/domains");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteDnsRecordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireAdmin();
  const domain = String(formData.get("domain") ?? "").trim().toLowerCase();
  const recordId = String(formData.get("recordId") ?? "");
  try {
    await deleteDnsRecord(domain, recordId);
    await audit("dns.delete", domain, { actorId: ctx.user.id, detail: { recordId } });
    revalidatePath("/domains");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Discard a domain's custom records; it follows the global templates again. */
export async function resetDnsRecordsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireAdmin();
  const domain = String(formData.get("domain") ?? "").trim().toLowerCase();
  try {
    await resetDnsRecords(domain);
    await audit("dns.reset", domain, { actorId: ctx.user.id });
    revalidatePath("/domains");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Register a new domain: create its Org (tenant) + Domain in our DB and generate a
 * DKIM key on the mail server. The domain starts delivering once its DNS (shown on
 * the Domains page) is published and its first mailbox is added.
 */
export async function addDomainAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireAdmin();
  const name = String(formData.get("domain") ?? "").trim().toLowerCase();
  const orgName = String(formData.get("org") ?? "").trim() || name;
  try {
    assertDomain(name);
    const org = await prisma.org.upsert({
      where: { slug: slugify(orgName) },
      update: {},
      create: { slug: slugify(orgName), name: orgName },
    });
    const existing = await prisma.domain.findUnique({ where: { name } });
    if (existing) return { ok: false, error: "That domain already exists" };
    await prisma.domain.create({ data: { name, orgId: org.id } });
    await generateDkim(name);
    await audit("domain.add", name, { orgId: org.id, actorId: ctx.user.id });
    revalidatePath("/domains");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Delete a domain from SutazMail (DB rows + DKIM key). Refuses while it still has
 * mailboxes on the mail server. Does not remove published registrar DNS.
 */
export async function deleteDomainAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireAdmin();
  const name = String(formData.get("domain") ?? "").trim().toLowerCase();
  try {
    await deleteManagedDomain(name);
    // orgId is intentionally omitted: the owning org may have just been cleaned up.
    await audit("domain.delete", name, { actorId: ctx.user.id });
    revalidatePath("/domains");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
