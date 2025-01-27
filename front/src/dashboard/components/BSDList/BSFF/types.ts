import { BsffStatus } from "generated/graphql/types";

export interface BsffFragment {
  id: string;
  isDraft: boolean;
  bsffStatus: BsffStatus;
  bsffEmitter?: {
    company?: {
      siret?: string;
      name?: string;
    };
  };
  bsffTransporter?: {
    company?: {
      siret?: string;
      name?: string;
    };
    customInfo?: string;
    transport?: {
      plates?: string[];
    };
  };
  bsffDestination?: {
    company?: {
      siret?: string;
      name?: string;
    };
  };
  waste?: {
    code?: string;
    description?: string;
  };
  packagings?: { id: string; numero: string }[];
}
