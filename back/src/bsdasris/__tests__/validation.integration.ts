import { ValidationError } from "yup";
import { validateBsdasri } from "../validation";

import { initialData, readyToTakeOverData } from "./factories";

describe("Mutation.signBsdasri emission", () => {
  it("should validate emission", async () => {
    const dasri = initialData({ siret: 12312345600000, name: "emetteur" });
    await validateBsdasri(dasri, { emissionSignature: true });
  });

  it("should validate transport", async () => {
    const dasri = readyToTakeOverData({
      siret: 53075596600047,
      name: "transporteur"
    });
    await validateBsdasri(dasri, { transportSignature: true });
  });

  it("should validate emission and transport", async () => {
    const dasri = {
      ...initialData({ siret: 12312345600000, name: "emetteur" }),
      ...readyToTakeOverData({
        siret: 53075596600047,
        name: "transporteur"
      })
    };
    await validateBsdasri(dasri, {
      emissionSignature: true,
      transportSignature: true
    });
  });

  it("should validate without recipisse when it's a foreign transport", async () => {
    const dasri = readyToTakeOverData({
      vatNumber: "BE0541696005",
      name: "transporteur DE"
    });
    delete dasri.transporterRecepisseNumber;
    delete dasri.transporterRecepisseDepartment;
    delete dasri.transporterRecepisseValidityLimit;
    await validateBsdasri(dasri, { transportSignature: true });
  });

  it("should not validate without recipisse when it's a foreign transport", async () => {
    const dasri = await readyToTakeOverData({
      opt: {
        transporterCompanySiret: "12345678901234",
        transporterCompanyName: "transporteur FR"
      }
    });
    delete dasri.transporterRecepisseDepartment;
    delete dasri.transporterRecepisseNumber;
    await expect(() =>
      validateBsdasri(dasri, {
        transportSignature: true
      })
    ).rejects.toThrow(ValidationError);
  });
});
