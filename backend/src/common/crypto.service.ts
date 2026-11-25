import { Inject, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ENV } from '../config/env.token';
import type { Env } from '../config/env.validation';

/**
 * AES-256-GCM for stored API credentials. Ciphertext format: "v1.<iv>.<tag>.<data>", each part base64.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(@Inject(ENV) env: Pick<Env, 'ENCRYPTION_KEY'>) {
    this.key = Buffer.from(env.ENCRYPTION_KEY, 'base64');
    if (this.key.length !== 32) throw new Error('ENCRYPTION_KEY must decode to 32 bytes');
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join('.');
  }

  decrypt(payload: string): string {
    const [v, iv, tag, data] = payload.split('.');
    if (v !== 'v1' || !iv || !tag || data === undefined) throw new Error('Unrecognised ciphertext');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  }

  encryptJson(value: object | null | undefined): string | null {
    if (!value || Object.keys(value).length === 0) return null;
    return this.encrypt(JSON.stringify(value));
  }

  decryptJson<T extends object>(payload: string | null | undefined): T | null {
    if (!payload) return null;
    return JSON.parse(this.decrypt(payload)) as T;
  }
}
