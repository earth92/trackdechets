function detenteurInput(siret: string) {
  return {
    company: {
      siret,
      name: "Client",
      address: "5 boulevard Longchamp, 13001 MARSEILLE",
      contact: "Le directeur",
      phone: "04 00 00 00 00",
      mail: "jean@magasin1.fr"
    }
  };
}

function operateurInput(siret: string) {
  return { company: operateurCompanyInput(siret) };
}

function operateurCompanyInput(siret: string) {
  return {
    siret,
    name: "Les gentlemen du froid",
    address: "1 rue de paradis, 75010 PARIS",
    contact: "Le directeur",
    phone: "01 00 00 00 00",
    mail: "contact@gentlemandufroid.fr"
  };
}

function transporterInput(siret: string) {
  return {
    company: {
      siret,
      name: "Transport & Co",
      address: "1 rue des 6 chemins, 07100 ANNONAY",
      contact: "Claire Dupuis",
      mail: "claire.dupuis@transportco.fr",
      phone: "04 00 00 00 00"
    },
    recepisse: {
      number: "XXXXX",
      department: "07",
      validityLimit: "2023-01-01"
    }
  };
}

function ttrInput(siret: string) {
  return {
    company: {
      siret,
      name: "Entreposage & Co",
      address: "1 rue du stock 68100 Mulhouse",
      contact: "Antoine Quistock",
      phone: "03 00 00 00 00",
      mail: "antoine.quistock@entreposage.fr"
    },
    cap: "CAP",
    plannedOperationCode: "D13"
  };
}

function traiteurCompanyInput(siret: string) {
  return {
    siret,
    name: "Traiteur & Co",
    address: "1 avenue des roses 67100 Strasbourg",
    contact: "Thomas Largeron",
    phone: "03 00 00 00 00",
    mail: "thomas.largeron@traiteur.fr"
  };
}

function nextDestinationInput(siret: string) {
  return {
    plannedOperationCode: "R2",
    cap: "CAP 2",
    company: traiteurCompanyInput(siret)
  };
}

function traiteurInput(siret: string) {
  return {
    cap: "CAP",
    plannedOperationCode: "R2",
    company: traiteurCompanyInput(siret)
  };
}

export default {
  detenteurInput,
  operateurInput,
  transporterInput,
  ttrInput,
  traiteurInput,
  nextDestinationInput
};
