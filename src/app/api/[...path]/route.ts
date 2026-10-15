import { NextRequest } from 'next/server';
import { z } from 'zod';
import { database } from '@/lib/db';
import {
  ok,
  failure,
  assertOrigin,
  actorFor,
  jsonBody,
  rawBody,
  sessionCookie,
  cookieOptions,
  clientIp,
} from '@/lib/http';
import { DomainError, requireThat } from '@/lib/domain/errors';
import { register, login, throttleAuth, createSession, revokeSession } from '@/lib/services/auth';
import { getProfile, saveProfile } from '@/lib/services/profiles';
import {
  createStudy,
  listStudies,
  studyDetail,
  applyToStudy,
  reviewApplication,
} from '@/lib/services/studies';
import { sandboxFund } from '@/lib/services/funding';
import {
  listParticipations,
  participationDetail,
  startParticipation,
  checkIn,
  submitTask,
  submitParticipation,
  reviewParticipation,
  disputeParticipation,
} from '@/lib/services/participations';
import { dashboard } from '@/lib/services/dashboard';
import { wallet, sandboxPayout } from '@/lib/services/wallet';
import { googleStart, googleCallback } from '@/lib/services/google';
import { quote, quoteInput } from '@/lib/domain/money';
import {
  mercadoPagoCheckout,
  MercadoPagoAdapter,
  verifyMercadoPagoSignature,
  handleMercadoPagoPayment,
} from '@/lib/payments/mercadopago';
import { capabilities } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };
const idSchema = z.uuid();

async function handle(req: NextRequest, context: Context) {
  try {
    const segments = (await context.params).path;
    const path = segments.join('/');
    const method = req.method;
    if (method === 'GET' && path === 'capabilities') return ok(capabilities());
    if (method === 'GET' && path === 'health') {
      const db = await database();
      await db.query('SELECT 1 AS healthy');
      return ok({ status: 'ok', database: 'connected', version: '0.1.0' });
    }
    if (method === 'GET' && path === 'auth/google') return await googleStart(req);
    if (method === 'GET' && path === 'auth/google/callback') return await googleCallback(req);
    if (method === 'POST' && path === 'webhooks/mercadopago') {
      requireThat(
        process.env.MERCADOPAGO_WEBHOOK_SECRET && process.env.MERCADOPAGO_ACCESS_TOKEN,
        'PAYMENT_PROVIDER_UNAVAILABLE',
        503,
      );
      await rawBody(req, 1048576);
      const dataId = req.nextUrl.searchParams.get('data.id');
      const requestId = req.headers.get('x-request-id');
      const signature = req.headers.get('x-signature');
      requireThat(dataId && requestId && signature, 'INVALID_SIGNATURE', 400);
      verifyMercadoPagoSignature(
        { dataId, requestId, signature },
        process.env.MERCADOPAGO_WEBHOOK_SECRET,
      );
      return ok(
        await handleMercadoPagoPayment(
          await database(),
          new MercadoPagoAdapter(process.env.MERCADOPAGO_ACCESS_TOKEN),
          dataId,
          requestId,
        ),
      );
    }
    if (method !== 'GET') assertOrigin(req);
    const db = await database();
    if (method === 'POST' && ['auth/register', 'auth/login'].includes(path)) {
      await throttleAuth(db, clientIp(req), path);
      const actor =
        path === 'auth/register'
          ? await register(db, await jsonBody(req))
          : await login(db, await jsonBody(req));
      const session = await createSession(db, actor.id);
      const res = ok({ actor }, path === 'auth/register' ? 201 : 200);
      res.cookies.set(sessionCookie, session.token, { ...cookieOptions, expires: session.expires });
      return res;
    }
    if (method === 'POST' && path === 'auth/logout') {
      await revokeSession(db, req.cookies.get(sessionCookie)?.value);
      const res = ok({ signedOut: true });
      res.cookies.set(sessionCookie, '', { ...cookieOptions, maxAge: 0 });
      return res;
    }
    if (method === 'POST' && path === 'quote')
      return ok(quote(quoteInput.parse(await jsonBody(req))));
    const actor = await actorFor(req, db);
    if (method === 'GET' && path === 'me')
      return ok({ actor, profile: await getProfile(db, actor.id), capabilities: capabilities() });
    if (method === 'PUT' && path === 'profile')
      return ok(await saveProfile(db, actor, await jsonBody(req)));
    if (method === 'GET' && path === 'dashboard') return ok(await dashboard(db, actor));
    if (method === 'GET' && path === 'wallet') return ok(await wallet(db, actor));
    if (method === 'GET' && path === 'studies')
      return ok(await listStudies(db, actor, req.nextUrl.searchParams.get('own') === 'true'));
    if (method === 'POST' && path === 'studies')
      return ok(await createStudy(db, actor, await jsonBody(req)), 201);
    if (segments[0] === 'studies' && segments[1]) {
      const id = idSchema.parse(segments[1]);
      if (method === 'GET' && segments.length === 2) return ok(await studyDetail(db, actor, id));
      if (method === 'POST' && segments[2] === 'sandbox-fund')
        return ok(await sandboxFund(db, actor, id));
      if (method === 'POST' && segments[2] === 'checkout')
        return ok(await mercadoPagoCheckout(db, actor, id));
      if (method === 'POST' && segments[2] === 'apply') {
        const data = z
          .object({ note: z.string().trim().max(1000).default('') })
          .parse(await jsonBody(req));
        return ok(await applyToStudy(db, actor, id, data.note), 201);
      }
    }
    if (method === 'POST' && segments[0] === 'applications' && segments[2] === 'review') {
      const id = idSchema.parse(segments[1]);
      const data = z.object({ decision: z.enum(['accept', 'reject']) }).parse(await jsonBody(req));
      return ok(await reviewApplication(db, actor, id, data.decision === 'accept'));
    }
    if (method === 'GET' && path === 'participations')
      return ok(await listParticipations(db, actor));
    if (segments[0] === 'participations' && segments[1]) {
      const id = idSchema.parse(segments[1]);
      if (method === 'GET' && segments.length === 2)
        return ok(await participationDetail(db, actor, id));
      if (method === 'POST' && segments[2] === 'start')
        return ok(await startParticipation(db, actor, id));
      if (method === 'POST' && segments[2] === 'check-in') {
        const data = z
          .object({ note: z.string().trim().min(10).max(2000) })
          .parse(await jsonBody(req));
        return ok(await checkIn(db, actor, id, data.note));
      }
      if (method === 'POST' && segments[2] === 'tasks') {
        const data = z
          .object({ taskId: z.uuid(), feedback: z.string().trim().min(30).max(5000) })
          .parse(await jsonBody(req));
        return ok(await submitTask(db, actor, id, data.taskId, data.feedback));
      }
      if (method === 'POST' && segments[2] === 'submit')
        return ok(await submitParticipation(db, actor, id));
      if (method === 'POST' && segments[2] === 'review') {
        const data = z
          .object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(2000) })
          .refine((v) => v.decision === 'approve' || v.note.length >= 10)
          .parse(await jsonBody(req));
        return ok(await reviewParticipation(db, actor, id, data.decision === 'approve', data.note));
      }
      if (method === 'POST' && segments[2] === 'dispute') {
        const data = z
          .object({ reason: z.string().trim().min(30).max(2000) })
          .parse(await jsonBody(req));
        return ok(await disputeParticipation(db, actor, id, data.reason), 201);
      }
    }
    if (method === 'POST' && segments[0] === 'rewards' && segments[2] === 'sandbox-payout')
      return ok(await sandboxPayout(db, actor, idSchema.parse(segments[1])));
    throw new DomainError('NOT_FOUND', 404);
  } catch (error) {
    return failure(error);
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
