import { redisClient, generateKey } from "./redis";
import { getUserCompanies } from "../../users/database";
import { sess } from "../../server";

const CACHED_COMPANY_EXPIRATION = 10 * 60; // 10 minutes

export const genUserCompanySiretCacheKey = (userId: string): string =>
  generateKey("userSirets", userId);

export const genUserCompaniesCacheKey = (userId: string): string =>
  generateKey("userCompanies", userId);

/**
 * Delete the cached sirets for a given user
 * @param userId
 */
export async function deleteCachedUserCompanies(userId: string): Promise<void> {
  const sirets = genUserCompanySiretCacheKey(userId); // non-existent keys are ignored
  const ids = genUserCompaniesCacheKey(userId); // non-existent keys are ignored
  await Promise.all([redisClient.unlink(sirets), redisClient.unlink(ids)]);
}

/**
 * Store Company id in a redis SET
 * @param userId
 * @param ids
 */
export async function setCachedUserCompanyId(
  userId: string,
  ids: string[]
): Promise<void> {
  const key = genUserCompaniesCacheKey(userId);

  await redisClient
    .pipeline()
    .sadd(key, ids)
    .expire(key, CACHED_COMPANY_EXPIRATION)
    .exec();
}

/**
 * Retrieve cached Company siret and vatNumber
 * if found in redis, or query the db and cache them
 * @param userId
 * @returns array of sirets and vatNumber
 */
export async function getCachedUserSiretOrVat(
  userId: string
): Promise<string[]> {
  const key = genUserCompaniesCacheKey(userId);
  const exists = await redisClient.exists(key);
  if (!!exists) {
    return redisClient.smembers(key);
  }
  // refresh cache
  const companies = await getUserCompanies(userId);
  const ids = [
    ...companies.map(c => c.siret),
    ...companies.map(c => c.vatNumber)
  ];
  const cleanIds = ids.filter(id => !!id);
  await setCachedUserCompanyId(userId, cleanIds);
  return cleanIds;
}

export const USER_SESSIONS_CACHE_KEY = "users-sessions-id";

export const genUserSessionsIdsKey = (userId: string): string =>
  `${USER_SESSIONS_CACHE_KEY}-${userId}`;

/**
 * Persist a redis set `users-sessions-id:${userId}`: {sessionID1, sessionID2, sessionID3} to ease session retrieval and deletion
 * @param userId
 * @param sessionId: the id without the "sess:"" part
 * @returns
 */
export async function storeUserSessionsId(
  userId: string,
  sessionId: string
): Promise<void> {
  if (!userId) {
    return;
  }

  await redisClient.sadd(genUserSessionsIdsKey(userId), sessionId);
}

export async function getUserSessions(userId: string): Promise<string[]> {
  if (!userId) {
    return;
  }
  return redisClient.smembers(genUserSessionsIdsKey(userId));
}

/**
 * Delete all user sessions
 * Delete the sessionkeys referenced in USER_SESSIONS_CACHE_KEY
 * @param userId
 */
export async function clearUserSessions(userId: string): Promise<void> {
  const sessions = await getUserSessions(userId);

  sessions.forEach(sessionId => sess.store.destroy(sessionId));

  await redisClient.del(genUserSessionsIdsKey(userId));
}
