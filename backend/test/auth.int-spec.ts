import { createTestApp, TestApp, USER } from './helpers';

describe('auth + health', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('logs in with a plain password (email case-insensitive)', async () => {
    const r = await t.http().post('/api/auth/login').set('X-Forwarded-For', '10.0.0.1').send({ email: 'Tester@Example.com', password: USER.password });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ accessToken: expect.any(String), expiresIn: 43200, email: 'tester@example.com' });
  });

  it('logs in with a bcrypt value', async () => {
    const r = await t.http().post('/api/auth/login').set('X-Forwarded-For', '10.0.0.2').send({ email: 'hash@example.com', password: 'Hashed#1' });
    expect(r.status).toBe(200);
  });

  it('401s on a wrong password or unknown user with the shared error shape', async () => {
    const a = await t.http().post('/api/auth/login').set('X-Forwarded-For', '10.0.0.3').send({ email: USER.email, password: 'nope' });
    expect(a.status).toBe(401);
    expect(a.body).toEqual({ statusCode: 401, error: 'Unauthorized', message: 'Email or password is incorrect.' });
    const b = await t.http().post('/api/auth/login').set('X-Forwarded-For', '10.0.0.3').send({ email: 'nobody@example.com', password: 'nope' });
    expect(b.status).toBe(401);
  });

  it('400s with fields on a malformed body', async () => {
    const r = await t.http().post('/api/auth/login').set('X-Forwarded-For', '10.0.0.4').send({ email: 'not-an-email' });
    expect(r.status).toBe(400);
    expect(r.body.fields).toEqual({ email: 'Enter a valid email address.', password: expect.any(String) });
  });

  it('429s after 5 attempts a minute from one IP (X-Forwarded-For honoured)', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await t.http().post('/api/auth/login').set('X-Forwarded-For', '10.0.0.9').send({ email: USER.email, password: 'bad' });
      codes.push(r.status);
    }
    expect(codes).toEqual([401, 401, 401, 401, 401, 429]);
    // another IP is unaffected
    const other = await t.http().post('/api/auth/login').set('X-Forwarded-For', '10.0.0.10').send(USER);
    expect(other.status).toBe(200);
  });

  it('protects routes and serves /auth/me', async () => {
    expect((await t.http().get('/api/auth/me')).status).toBe(401);
    expect((await t.http().get('/api/auth/me').set('Authorization', 'Bearer garbage')).status).toBe(401);
    const me = await t.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body).toEqual({ email: USER.email });
  });

  it('health is public and reports the db', async () => {
    const r = await t.http().get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'ok', db: 'up', runner: 'disabled' });
  });
});
