import { zh } from './zh';
import { en } from './en';

export type Language = 'zh' | 'en';
export type I18n = typeof zh;

export const translations: Record<Language, I18n> = { zh, en };

export { zh, en };
