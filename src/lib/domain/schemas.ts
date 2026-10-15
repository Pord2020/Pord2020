import { z } from 'zod';
export const interests = [
  'wellness',
  'productivity',
  'finance',
  'education',
  'food',
  'travel',
  'gaming',
  'shopping',
  'social',
  'design',
] as const;
export const localeSchema = z.enum(['en', 'es']);
export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(12).max(128),
  role: z.enum(['founder', 'tester']),
  locale: localeSchema.default('en'),
});
export const loginSchema = registerSchema.pick({ email: true, password: true });
export const profileSchema = z.object({
  country: z.string().regex(/^[A-Z]{2}$/),
  age: z.number().int().min(18).max(100),
  gender: z.enum(['woman', 'man', 'nonbinary', 'undisclosed']),
  interests: z.array(z.enum(interests)).max(10),
  platforms: z
    .array(z.enum(['android', 'ios', 'web']))
    .min(1)
    .max(3),
  matchingConsent: z.boolean(),
});
export const studySchema = z
  .object({
    title: z.string().trim().min(4).max(100),
    appName: z.string().trim().min(2).max(60),
    description: z.string().trim().min(30).max(2000),
    platform: z.enum(['android', 'ios', 'web']),
    kind: z.enum(['closed_test', 'usability']),
    category: z.enum(interests),
    rewardCents: z.number().int().min(500).max(50000),
    seats: z.number().int().min(1).max(200),
    durationDays: z.number().int().min(1).max(45),
    countries: z
      .array(z.string().regex(/^[A-Z]{2}$/))
      .max(30)
      .default([]),
    minimumAge: z.number().int().min(18).max(100).default(18),
    maximumAge: z.number().int().min(18).max(100).default(100),
    gender: z.enum(['any', 'woman', 'man', 'nonbinary']).default('any'),
    requiredInterests: z.array(z.enum(interests)).max(5).default([]),
    inviteUrl: z
      .url()
      .max(1000)
      .refine((v) => {
        const u = new URL(v);
        return u.protocol === 'https:' && !u.username && !u.password;
      }, 'HTTPS invitation required'),
    tasks: z.array(z.string().trim().min(8).max(300)).min(1).max(8),
  })
  .refine((v) => v.maximumAge >= v.minimumAge, 'Invalid age range')
  .refine(
    (v) =>
      v.kind !== 'closed_test' ||
      (v.platform === 'android' && v.seats >= 12 && v.durationDays >= 14),
    'Closed tests require Android, at least 12 testers and 14 days',
  );
export type StudyInput = z.infer<typeof studySchema>;
export type TesterProfile = z.infer<typeof profileSchema>;

export function matches(
  profile: TesterProfile | null,
  study: {
    platform: string;
    countries: string[];
    minimum_age: number;
    maximum_age: number;
    gender: string;
    required_interests: string[];
  },
): boolean {
  if (!profile?.matchingConsent) return false;
  return (
    profile.age >= study.minimum_age &&
    profile.age <= study.maximum_age &&
    (study.countries.length === 0 || study.countries.includes(profile.country)) &&
    (study.gender === 'any' || profile.gender === study.gender) &&
    profile.platforms.includes(study.platform as TesterProfile['platforms'][number]) &&
    study.required_interests.every((i) =>
      profile.interests.includes(i as TesterProfile['interests'][number]),
    )
  );
}
