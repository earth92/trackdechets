import { StatutDiffusionEtablissement } from "../../generated/graphql/types";

/**
 * Interface des résultats sur la base Sirene INSEE
 */
export interface SireneSearchResult {
  addressVoie?: string;
  addressPostalCode?: string;
  addressCity?: string;
  /** Adresse de l'établissement */
  address?: string;
  /** Code commune de l'établissement */
  codeCommune?: string;
  /** Code pays de l'établissement */
  codePaysEtrangerEtablissement?: string;

  /** État administratif de l'établissement. A = Actif, F = Fermé */
  etatAdministratif?: string;
  /** Si oui on non cet établissement est inscrit sur la plateforme Trackdéchets */
  isRegistered?: boolean;
  /** Libellé NAF */
  libelleNaf?: string;
  /** Code NAF */
  naf?: string;
  /** Nom de l'établissement */
  name?: string;
  /** SIRET de l'établissement */
  siret?: string;
  /** Statut de diffusion des informations de l'établisement selon l'INSEE */
  statutDiffusionEtablissement?: StatutDiffusionEtablissement;
}

interface PeriodeEtablissementInsee {
  etatAdministratifEtablissement: string;
  activitePrincipaleEtablissement: string;
}
interface EtablissementInsee {
  siret: string;
  uniteLegale: {
    denominationUniteLegale: string;
    categorieJuridiqueUniteLegale: string;
    prenom1UniteLegale: string;
    nomUniteLegale: string;
  };
  adresseEtablissement: {
    numeroVoieEtablissement: string;
    indiceRepetitionEtablissement: string;
    complementAdresseEtablissement: string;
    typeVoieEtablissement: string;
    libelleVoieEtablissement: string;
    codePostalEtablissement: string;
    libelleCommuneEtablissement: string;
    codeCommuneEtablissement: string;
  };
  periodesEtablissement: PeriodeEtablissementInsee[];
  statutDiffusionEtablissement: "O" | "N";
}

// Response from https://api.insee.fr/entreprises/siret/V3/siret/<VOTRE_SIRET>
export interface SearchResponseInsee {
  etablissement: EtablissementInsee;
}

// Response from https://api.insee.fr/entreprises/siret/V3/siret/
export interface FullTextSearchResponseInsee {
  etablissements: EtablissementInsee[];
}

// Response from https://search-recherche-entreprises.fabrique.social.gouv.fr/api/v1/etablissement/<VOTRE_SIRET>
export interface SearchResponseSocialGouv {
  siret: string;
  activitePrincipale: string;
  categorieJuridiqueUniteLegale: string;
  etatAdministratifEtablissement: string;
  address: string;
  codeCommuneEtablissement: string;
  label: string;
  statutDiffusionEtablissement: "O" | "N";
}

export interface MatchingEtablissementSocialGouv {
  siret: string;
  address: string;
  etatAdministratif: string;
  statutDiffusionEtablissement: "O" | "N";
}

export interface MatchingEntrepriseSocialGouv {
  activitePrincipale: string;
  label: string;
  categorieJuridiqueUniteLegale: string;
  allMatchingEtablissements: MatchingEtablissementSocialGouv[];
}
// Response from https://search-recherche-entreprises.fabrique.social.gouv.fr/api/v1/search?query=<QUERY>
export interface FullTextSearchResponseSocialGouv {
  entreprises: MatchingEntrepriseSocialGouv[];
}
