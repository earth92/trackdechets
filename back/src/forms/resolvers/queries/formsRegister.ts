import { checkIsAuthenticated } from "../../../common/permissions";
import { checkIsCompanyMember } from "../../../users/permissions";
import {
  FormsRegisterExportType,
  QueryResolvers,
  QueryWastesRegistryCsvArgs,
  QueryWastesRegistryXlsArgs,
  WasteRegistryType
} from "../../../generated/graphql/types";
import { wastesRegistryCsvResolverFn } from "../../../registry/resolvers/queries/wastesRegistryCsv";
import { wastesRegistryXlsResolverFn } from "../../../registry/resolvers/queries/wastesRegistryXls";

// compatibility between register v1 and register v2
const exportTypeToRegisterType: Record<
  FormsRegisterExportType,
  WasteRegistryType
> = {
  OUTGOING: "OUTGOING",
  INCOMING: "INCOMING",
  TRANSPORTED: "TRANSPORTED",
  TRADED: "MANAGED",
  BROKERED: "MANAGED",
  ALL: "ALL"
};

/**
 * DEPRECATED
 * Forms only register exports
 * This resolver calls wastesXls or wastesCsv resolver with bsdType=BSDD
 * for compatibility
 */
const formsRegisterResolver: QueryResolvers["formsRegister"] = async (
  parent,
  args,
  context
) => {
  const user = checkIsAuthenticated(context);

  for (const siret of args.sirets) {
    // check user is member of every provided sirets
    await checkIsCompanyMember({ id: user.id }, { siret: siret });
  }

  const wasteRegistryArgs:
    | QueryWastesRegistryCsvArgs
    | QueryWastesRegistryXlsArgs = {
    registryType: exportTypeToRegisterType[args.exportType],
    sirets: args.sirets,
    where: {
      bsdType: { _eq: "BSDD" },
      ...(args.wasteCode ? { wasteCode: { _eq: args.wasteCode } } : {}),
      ...(args.startDate || args.endDate
        ? {
            createdAt: {
              ...(args.startDate ? { _gte: new Date(args.startDate) } : {}),
              ...(args.endDate ? { _lte: new Date(args.endDate) } : {})
            }
          }
        : {})
    }
  };

  // delegate resolution to wastesCsv and wastesXls with bsdType == BSDD
  return args.exportFormat === "CSV"
    ? wastesRegistryCsvResolverFn(wasteRegistryArgs, context)
    : wastesRegistryXlsResolverFn(wasteRegistryArgs, context);
};

export default formsRegisterResolver;
