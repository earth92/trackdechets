import { resetDatabase } from "../../../../integration-tests/helper";
import testWorkflow from "../../../__tests__/testWorkflow";
import acheminementDirect from "../workflows/acheminementDirect";
import emportDirect from "../workflows/emportDirect";
import dasriDeSynthese from "../workflows/dasriDeSynthese";
import dasriDeGroupement from "../workflows/dasriDeGroupement";
import acheminementDirectEcoOrganisme from "../workflows/ecoOrganisme";
import signatureCodeSecret from "../workflows/signatureCodeSecret";
import signatureCodeSecretEcoOrganisme from "../workflows/signatureCodeSecretEcoOrganisme";

describe("Exemples de circuit du bordereau de suivi DASRI", () => {
  afterEach(resetDatabase);

  test(
    signatureCodeSecretEcoOrganisme.title,
    async () => {
      await testWorkflow(signatureCodeSecretEcoOrganisme);
    },
    60000
  );

  test(
    signatureCodeSecret.title,
    async () => {
      await testWorkflow(signatureCodeSecret);
    },
    60000
  );

  test(
    acheminementDirectEcoOrganisme.title,
    async () => {
      await testWorkflow(acheminementDirectEcoOrganisme);
    },
    60000
  );

  test(
    acheminementDirect.title,
    async () => {
      await testWorkflow(acheminementDirect);
    },
    60000
  );

  test(
    emportDirect.title,
    async () => {
      await testWorkflow(emportDirect);
    },
    60000
  );

  test(
    dasriDeSynthese.title,
    async () => {
      await testWorkflow(dasriDeSynthese);
    },
    60000
  );

  test(
    dasriDeGroupement.title,
    async () => {
      await testWorkflow(dasriDeGroupement);
    },
    60000
  );
});
