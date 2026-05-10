/// <reference types="astro/client" />
import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';

declare global {
  namespace App {
    interface Locals {
      pb: PocketBase;
      user: RecordModel | null;
    }
  }
}

export {};
