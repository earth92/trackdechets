import prisma from "../../../prisma";
import {
  MutationEditProfileArgs,
  MutationResolvers
} from "../../../generated/graphql/types";
import { checkIsAuthenticated } from "../../../common/permissions";
import { applyAuthStrategies, AuthType } from "../../../auth";
import * as yup from "yup";

/**
 * Edit user profile
 * Each field can be edited separately so we need to handle
 * undefined values
 * @param userId
 * @param payload
 */
export async function editProfileFn(
  userId: string,
  payload: MutationEditProfileArgs
) {
  const editProfileSchema = yup.object({
    name: yup.string().ensure().isSafeSSTI(),
    phone: yup.string()
  });
  editProfileSchema.validateSync(payload);

  const { name, phone } = payload;

  const data = {
    ...(name !== undefined ? { name } : {}),
    ...(phone !== undefined ? { phone } : {})
  };

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data
  });

  return {
    ...updatedUser,
    // companies are resolved through a separate resolver (User.companies)
    companies: []
  };
}

const editProfileResolver: MutationResolvers["editProfile"] = (
  parent,
  args,
  context
) => {
  applyAuthStrategies(context, [AuthType.Session]);

  const user = checkIsAuthenticated(context);

  return editProfileFn(user.id, args);
};

export default editProfileResolver;
