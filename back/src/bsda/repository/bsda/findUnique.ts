import { Prisma } from "@prisma/client";
import { ReadRepositoryFnDeps } from "../../../common/repository/types";

export type FindUniqueBsdaFn = <Args extends Prisma.BsdaArgs>(
  where: Prisma.BsdaWhereUniqueInput,
  options?: Args
) => Promise<Prisma.BsdaGetPayload<Args>>;

export function buildFindUniqueBsda({
  prisma
}: ReadRepositoryFnDeps): FindUniqueBsdaFn {
  return async <Args>(where, options?) => {
    const input = { where, ...options };
    const bsda = await prisma.bsda.findUnique(input);
    return bsda as Prisma.BsdaGetPayload<Args>;
  };
}
