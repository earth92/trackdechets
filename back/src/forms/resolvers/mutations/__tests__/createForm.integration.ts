import { format } from "date-fns";
import { resetDatabase } from "../../../../../integration-tests/helper";
import prisma from "../../../../prisma";
import { ErrorCode } from "../../../../common/errors";
import {
  companyFactory,
  formFactory,
  toIntermediaryCompany,
  userFactory,
  userWithCompanyFactory
} from "../../../../__tests__/factories";
import makeClient from "../../../../__tests__/testClient";
import { allowedFormats } from "../../../../common/dates";
import {
  CreateFormInput,
  Mutation,
  MutationCreateFormArgs,
  ParcelNumber
} from "../../../../generated/graphql/types";
import { EmitterType, Status, UserRole } from "@prisma/client";
import getReadableId from "../../../readableId";

const CREATE_FORM = `
  mutation CreateForm($createFormInput: CreateFormInput!) {
    createForm(createFormInput: $createFormInput) {
      id
      recipient {
        company {
          siret
        }
      }
      emitter {
        workSite {
          name
          address
          city
          postalCode
          infos
        }
      }
      ecoOrganisme {
        siret
      }
      temporaryStorageDetail {
        destination {
          company {
            siret
            name
          }
        }
      }
      transporter {
        company {
          siret
          name
          address
          contact
          mail
          phone
        }
        isExemptedOfReceipt
        receipt
        department
        validityLimit
        numberPlate
        customInfo
      }
      trader {
        company {
          siret
          name
          address
          contact
          mail
          phone
        }
        receipt
        department
        validityLimit
      }
      wasteDetails {
        packagingInfos {
          type
          other
          quantity
        }
        isDangerous
        parcelNumbers {
          city
          postalCode
          prefix
          section
          number
          x
          y
        }
      }
      appendix2Forms {
        id
      }
      grouping {
        quantity
        form {
          id
        }
      }
      intermediaries {
        name
        siret
        contact
      }
    }
  }
`;

describe("Mutation.createForm", () => {
  afterEach(resetDatabase);

  it("should disallow unauthenticated user", async () => {
    const { mutate } = makeClient();
    const { errors } = await mutate<Pick<Mutation, "createForm">>(CREATE_FORM, {
      variables: { createFormInput: {} }
    });

    expect(errors).toEqual([
      expect.objectContaining({
        message: "Vous n'êtes pas connecté.",
        extensions: expect.objectContaining({
          code: ErrorCode.UNAUTHENTICATED
        })
      })
    ]);
  });

  it("should disallow a user to create a form they are not part of", async () => {
    const user = await userFactory();

    const { mutate } = makeClient(user);
    const { errors } = await mutate<Pick<Mutation, "createForm">>(CREATE_FORM, {
      variables: {
        createFormInput: {
          emitter: {
            company: {
              siret: "siret"
            }
          }
        }
      }
    });

    expect(errors).toEqual([
      expect.objectContaining({
        message:
          "Vous ne pouvez pas créer un bordereau sur lequel votre entreprise n'apparait pas",
        extensions: expect.objectContaining({
          code: ErrorCode.FORBIDDEN
        })
      })
    ]);
  });

  it.each(["emitter", "trader", "recipient", "transporter"])(
    "should allow %p to create a form",
    async role => {
      const { user, company } = await userWithCompanyFactory("MEMBER");

      const { mutate } = makeClient(user);
      const { data } = await mutate<Pick<Mutation, "createForm">>(CREATE_FORM, {
        variables: {
          createFormInput: {
            [role]: {
              company: { siret: company.siret }
            }
          }
        }
      });
      expect(data.createForm.id).toBeTruthy();
    }
  );

  it("should allow an intermediary company to create a form", async () => {
    const intermediary = await userWithCompanyFactory(UserRole.MEMBER, {
      companyTypes: {
        set: ["TRANSPORTER"]
      }
    });
    const search = require("../../../../companies/search");
    const searchCompanyMock = jest.spyOn(search, "searchCompany");
    searchCompanyMock.mockResolvedValueOnce({
      siret: intermediary.company.siret,
      name: intermediary.company.name,
      statutDiffusionEtablissement: "O",
      address: intermediary.company.address
    });
    const intermediaryCreation = toIntermediaryCompany(intermediary.company);
    const { mutate } = makeClient(intermediary.user);
    const { data } = await mutate<Pick<Mutation, "createForm">>(CREATE_FORM, {
      variables: {
        createFormInput: {
          intermediaries: [intermediaryCreation]
        }
      }
    });

    expect(data.createForm.intermediaries).toEqual([
      expect.objectContaining({
        name: intermediary.company.name,
        siret: intermediary.company.siret,
        contact: intermediaryCreation.contact
      })
    ]);
  });

  it("should allow a destination after temp storage to create a form", async () => {
    const { user, company } = await userWithCompanyFactory("MEMBER");

    const { mutate } = makeClient(user);
    const { data } = await mutate<
      Pick<Mutation, "createForm">,
      MutationCreateFormArgs
    >(CREATE_FORM, {
      variables: {
        createFormInput: {
          recipient: { isTempStorage: true },
          temporaryStorageDetail: {
            destination: { company: { siret: company.siret } }
          }
        }
      }
    });
    expect(data.createForm.id).toBeTruthy();
  });

  it("should not allow to create a form with a foreign intermediary", async () => {
    const intermediary = await userWithCompanyFactory(UserRole.MEMBER, {
      companyTypes: {
        set: ["TRANSPORTER"]
      },
      vatNumber: "BE0541696005"
    });
    const { mutate } = makeClient(intermediary.user);
    const { errors } = await mutate<Pick<Mutation, "createForm">>(CREATE_FORM, {
      variables: {
        createFormInput: {
          intermediaries: [
            {
              vatNumber: "BE0541696005",
              name: "Belgian Co",
              contact: "Benoit"
            }
          ]
        }
      }
    });
    expect(errors).toEqual([
      expect.objectContaining({
        message:
          "Intermédiaires: seul les numéros de TVA en France sont valides",
        extensions: {
          code: "BAD_USER_INPUT"
        }
      })
    ]);
  });

  it("should not allow to create a form with an intermediary with only a FR VAT number but no SIRET", async () => {
    const intermediary = await userWithCompanyFactory(UserRole.MEMBER, {
      companyTypes: {
        set: ["TRANSPORTER"]
      },
      vatNumber: "FR87850019464"
    });
    const { mutate } = makeClient(intermediary.user);
    const { errors } = await mutate<Pick<Mutation, "createForm">>(CREATE_FORM, {
      variables: {
        createFormInput: {
          intermediaries: [
            {
              vatNumber: "FR87850019464",
              name: "Belgian Co",
              contact: "Benoit"
            }
          ]
        }
      }
    });
    expect(errors).toEqual([
      expect.objectContaining({
        message: "Intermédiaires: le N° SIRET est obligatoire",
        extensions: {
          code: "BAD_USER_INPUT"
        }
      })
    ]);
  });

  it("should allow an eco-organisme to create a form", async () => {
    const { user, company: eo } = await userWithCompanyFactory("MEMBER", {
      companyTypes: {
        set: ["ECO_ORGANISME"]
      }
    });
    await prisma.ecoOrganisme.create({
      data: {
        address: "",
        siret: eo.siret,
        name: eo.name
      }
    });

    const { mutate } = makeClient(user);
    const { data } = await mutate<Pick<Mutation, "createForm">>(CREATE_FORM, {
      variables: {
        createFormInput: {
          ecoOrganisme: {
            name: eo.name,
            siret: eo.siret
          }
        }
      }
    });

    expect(data.createForm.ecoOrganisme.siret).toBe(eo.siret);
  });

  it("should return an error when trying to create a form with a non-existing eco-organisme", async () => {
    const { user, company } = await userWithCompanyFactory("MEMBER");

    const createFormInput = {
      emitter: {
        company: {
          siret: company.siret
        }
      },
      ecoOrganisme: {
        name: "",
        siret: "does_not_exist"
      }
    };
    const { mutate } = makeClient(user);
    const { errors } = await mutate<Pick<Mutation, "createForm">>(CREATE_FORM, {
      variables: {
        createFormInput
      }
    });

    expect(errors).toEqual([
      expect.objectContaining({
        message: `L'éco-organisme avec le siret "${createFormInput.ecoOrganisme.siret}" n'est pas reconnu.`,
        extensions: expect.objectContaining({
          code: ErrorCode.BAD_USER_INPUT
        })
      })
    ]);
  });

  it("should create a form with a pickup site", async () => {
    const { user, company } = await userWithCompanyFactory("MEMBER");

    const createFormInput = {
      emitter: {
        workSite: {
          name: "The name",
          address: "The address",
          city: "The city",
          postalCode: "The postalCode",
          infos: "The infos"
        },
        company: {
          siret: company.siret,
          name: company.name
        }
      }
    };
    const { mutate } = makeClient(user);
    const { data } = await mutate<Pick<Mutation, "createForm">>(CREATE_FORM, {
      variables: { createFormInput }
    });

    expect(data.createForm.emitter.workSite).toMatchObject(
      createFormInput.emitter.workSite
    );
  });

  it("should create a form with a temporary storage", async () => {
    const { user, company } = await userWithCompanyFactory("MEMBER");
    const temporaryStorerCompany = await companyFactory();

    const createFormInput = {
      emitter: {
        company: {
          siret: company.siret,
          name: company.name
        }
      },
      recipient: {
        isTempStorage: true
      },
      temporaryStorageDetail: {
        destination: {
          company: {
            siret: temporaryStorerCompany.siret,
            name: temporaryStorerCompany.name
          }
        }
      }
    };
    const { mutate } = makeClient(user);
    const { data } = await mutate<Pick<Mutation, "createForm">>(CREATE_FORM, {
      variables: { createFormInput }
    });

    expect(data.createForm.temporaryStorageDetail.destination).toMatchObject(
      createFormInput.temporaryStorageDetail.destination
    );
  });

  it("should create a form with an empty temporary storage detail", async () => {
    const { user, company } = await userWithCompanyFactory("MEMBER");

    const { mutate } = makeClient(user);
    const { data } = await mutate<Pick<Mutation, "createForm">>(CREATE_FORM, {
      variables: {
        createFormInput: {
          emitter: {
            company: {
              siret: company.siret,
              name: company.name
            }
          },
          recipient: { isTempStorage: true }
        }
      }
    });

    expect(data.createForm.temporaryStorageDetail).toBeTruthy();
  });

  it("should create a form with parcel numbers", async () => {
    const { user, company } = await userWithCompanyFactory("MEMBER");

    const parcelNumbers: ParcelNumber[] = [
      {
        city: "Paris",
        postalCode: "75001",
        x: 12000,
        y: 12000
      },
      {
        city: "Paris",
        postalCode: "75001",
        number: "0039",
        prefix: "000",
        section: "OS"
      }
    ];

    const createFormInput = {
      emitter: {
        company: {
          siret: company.siret
        }
      },
      wasteDetails: {
        parcelNumbers
      }
    };
    const { mutate } = makeClient(user);
    const { data } = await mutate<Pick<Mutation, "createForm">>(CREATE_FORM, {
      variables: { createFormInput }
    });

    expect(data.createForm.wasteDetails.parcelNumbers[0]).toMatchObject(
      parcelNumbers[0]
    );
    expect(data.createForm.wasteDetails.parcelNumbers[1]).toMatchObject(
      parcelNumbers[1]
    );
  });

  it("should return an error when creating a form with a temporary storage detail but no temp storage flag", async () => {
    const { user, company } = await userWithCompanyFactory("MEMBER");

    const { mutate } = makeClient(user);
    const { errors } = await mutate<Pick<Mutation, "createForm">>(CREATE_FORM, {
      variables: {
        createFormInput: {
          emitter: {
            company: {
              siret: company.siret,
              name: company.name
            }
          },
          temporaryStorageDetail: {}
        }
      }
    });

    expect(errors).toEqual([
      expect.objectContaining({
        message: `Le champ recipient.isTempStorage doit être "true" lorsqu'un entreprosage provisoire est précisé.`,
        extensions: expect.objectContaining({
          code: ErrorCode.BAD_USER_INPUT
        })
      })
    ]);
  });

  it("create a form with a recipient", async () => {
    const { user, company } = await userWithCompanyFactory("MEMBER");
    const { company: recipientCompany } = await userWithCompanyFactory(
      "MEMBER"
    );

    const createFormInput = {
      emitter: {
        company: {
          siret: company.siret
        }
      },
      recipient: {
        company: {
          siret: recipientCompany.siret
        }
      }
    };
    const { mutate } = makeClient(user);
    const { data } = await mutate<Pick<Mutation, "createForm">>(CREATE_FORM, {
      variables: {
        createFormInput
      }
    });

    expect(data.createForm.recipient.company).toMatchObject(
      createFormInput.recipient.company
    );
  });

  it("should fail creating a form with a recipient if the recipient is not registered", async () => {
    const { user, company } = await userWithCompanyFactory("MEMBER");

    const createFormInput = {
      emitter: {
        company: {
          siret: company.siret
        }
      },
      recipient: {
        company: {
          siret: "01478520369874" // an unregistered siret
        }
      }
    };
    const { mutate } = makeClient(user);
    const { errors } = await mutate<Pick<Mutation, "createForm">>(CREATE_FORM, {
      variables: {
        createFormInput
      }
    });

    expect(errors).toEqual([
      expect.objectContaining({
        message:
          "L'installation de destination avec le SIRET 01478520369874 n'est pas inscrite sur Trackdéchets",
        extensions: expect.objectContaining({
          code: ErrorCode.BAD_USER_INPUT
        })
      })
    ]);
  });

  it("should fail creating a form with a transporter if the transporter is not registered", async () => {
    const { user, company } = await userWithCompanyFactory("MEMBER");

    const createFormInput = {
      emitter: {
        company: {
          siret: company.siret
        }
      },
      transporter: {
        company: {
          siret: "01478520369874"
        }
      }
    };
    const { mutate } = makeClient(user);
    const { errors } = await mutate<Pick<Mutation, "createForm">>(CREATE_FORM, {
      variables: {
        createFormInput
      }
    });

    expect(errors).toEqual([
      expect.objectContaining({
        message:
          "Le transporteur qui a été renseigné sur le bordereau (SIRET: 01478520369874) n'est pas inscrit sur Trackdéchets",
        extensions: expect.objectContaining({
          code: ErrorCode.BAD_USER_INPUT
        })
      })
    ]);
  });

  it.each([
    "abc",
    // Code of a category, not a waste
    "01",
    // Code of a sub-category, not a waste
    "01 01"
  ])(
    "should return an error when creating a form with the invalid waste code %p",
    async wasteCode => {
      const { user, company } = await userWithCompanyFactory("MEMBER");

      const { mutate } = makeClient(user);
      const { errors } = await mutate<Pick<Mutation, "createForm">>(
        CREATE_FORM,
        {
          variables: {
            createFormInput: {
              emitter: {
                company: {
                  siret: company.siret
                }
              },
              wasteDetails: {
                code: wasteCode
              }
            }
          }
        }
      );

      expect(errors).toEqual([
        expect.objectContaining({
          message:
            "Le code déchet n'est pas reconnu comme faisant partie de la liste officielle du code de l'environnement.",
          extensions: expect.objectContaining({
            code: ErrorCode.BAD_USER_INPUT
          })
        })
      ]);
    }
  );

  it("should create a form with a transporter", async () => {
    const { user, company } = await userWithCompanyFactory("MEMBER");
    const { company: transporterCompany } = await userWithCompanyFactory(
      "MEMBER"
    );

    const createFormInput = {
      emitter: {
        company: {
          siret: company.siret
        }
      },
      transporter: {
        company: {
          siret: transporterCompany.siret,
          name: "Transporter",
          address: "123 whatever street, Somewhere",
          contact: "Jane Doe",
          mail: "janedoe@transporter.com",
          phone: "06"
        },
        isExemptedOfReceipt: false,
        receipt: "8043",
        department: "69",
        validityLimit: "2040-01-01T00:00:00.000Z",
        numberPlate: "AX-123-69",
        customInfo: "T-456"
      }
    };
    const { mutate } = makeClient(user);
    const { data, errors } = await mutate<Pick<Mutation, "createForm">>(
      CREATE_FORM,
      {
        variables: {
          createFormInput
        }
      }
    );

    expect(errors).toEqual(undefined);
    expect(data.createForm.transporter).toMatchObject(
      createFormInput.transporter
    );
  });

  test.each(allowedFormats)(
    "%p should be a valid format for transporter and trader receipt validity limit",
    async f => {
      const { user, company } = await userWithCompanyFactory("MEMBER");
      const { company: transporterCompany } = await userWithCompanyFactory(
        "MEMBER"
      );

      const validityLimit = new Date("2040-01-01");
      const createFormInput = {
        emitter: {
          company: {
            siret: company.siret
          }
        },
        transporter: {
          company: {
            siret: transporterCompany.siret,
            name: "Transporter",
            address: "123 whatever street, Somewhere",
            contact: "Jane Doe",
            mail: "janedoe@transporter.com",
            phone: "06"
          },
          isExemptedOfReceipt: false,
          receipt: "8043",
          department: "69",
          validityLimit: format(validityLimit, f),
          numberPlate: "AX-123-69",
          customInfo: "T-456"
        },
        trader: {
          company: {
            siret: "12345678901234",
            name: "Trader",
            address: "123 Wall Street, NY",
            contact: "Jane Doe",
            mail: "janedoe@trader.com",
            phone: "06"
          },
          validityLimit: format(validityLimit, f),
          receipt: "8043",
          department: "07"
        }
      };
      const { mutate } = makeClient(user);
      const { data } = await mutate<Pick<Mutation, "createForm">>(CREATE_FORM, {
        variables: {
          createFormInput
        }
      });
      const form = await prisma.form.findUnique({
        where: { id: data.createForm.id }
      });
      expect(form.transporterValidityLimit).toEqual(validityLimit);
      expect(form.traderValidityLimit).toEqual(validityLimit);
    }
  );

  it("should create a form from deprecated packagings fields", async () => {
    const { user, company } = await userWithCompanyFactory("MEMBER");

    const createFormInput = {
      emitter: {
        company: {
          siret: company.siret
        }
      },
      wasteDetails: {
        packagings: ["FUT", "AUTRE"],
        otherPackaging: "Contenant",
        numberOfPackages: 2
      }
    };
    const { mutate } = makeClient(user);
    const { data } = await mutate<Pick<Mutation, "createForm">>(CREATE_FORM, {
      variables: { createFormInput }
    });

    const expectedPackagingInfos = [
      { type: "FUT", other: null, quantity: 1 },
      { type: "AUTRE", other: "Contenant", quantity: 1 }
    ];
    expect(data.createForm.wasteDetails.packagingInfos).toMatchObject(
      expectedPackagingInfos
    );
  });

  it(`should disallow a form with more than two "citernes"`, async () => {
    const { user, company } = await userWithCompanyFactory("MEMBER");

    const createFormInput = {
      emitter: {
        company: {
          siret: company.siret
        }
      },
      wasteDetails: {
        packagingInfos: [{ type: "CITERNE", quantity: 3 }]
      }
    };
    const { mutate } = makeClient(user);
    const { errors } = await mutate<Pick<Mutation, "createForm">>(CREATE_FORM, {
      variables: { createFormInput }
    });

    expect(errors).toEqual([
      expect.objectContaining({
        message: "Le nombre de benne ou de citerne ne peut être supérieur à 2.",
        extensions: expect.objectContaining({
          code: ErrorCode.BAD_USER_INPUT
        })
      })
    ]);
  });

  it(`should disallow a form with more than two "bennes"`, async () => {
    const { user, company } = await userWithCompanyFactory("MEMBER");

    const createFormInput = {
      emitter: {
        company: {
          siret: company.siret
        }
      },
      wasteDetails: {
        packagingInfos: [{ type: "BENNE", quantity: 3 }]
      }
    };
    const { mutate } = makeClient(user);
    const { errors } = await mutate<Pick<Mutation, "createForm">>(CREATE_FORM, {
      variables: { createFormInput }
    });

    expect(errors).toEqual([
      expect.objectContaining({
        message: "Le nombre de benne ou de citerne ne peut être supérieur à 2.",
        extensions: expect.objectContaining({
          code: ErrorCode.BAD_USER_INPUT
        })
      })
    ]);
  });

  it("should allow creating a form with an appendix 2 (using CreateFormInput.appendix2Forms)", async () => {
    const { user, company: ttr } = await userWithCompanyFactory("ADMIN");

    const appendix2 = await formFactory({
      ownerId: user.id,
      opt: {
        status: "AWAITING_GROUP",
        recipientCompanySiret: ttr.siret,
        quantityReceived: 1
      }
    });

    const createFormInput = {
      emitter: {
        type: EmitterType.APPENDIX2,
        company: {
          siret: ttr.siret
        }
      },
      appendix2Forms: [{ id: appendix2.id }]
    };
    const { mutate } = makeClient(user);
    const { data, errors } = await mutate<
      Pick<Mutation, "createForm">,
      MutationCreateFormArgs
    >(CREATE_FORM, {
      variables: { createFormInput }
    });

    expect(errors).toEqual(undefined);
    expect(data.createForm.appendix2Forms[0].id).toBe(appendix2.id);
  });

  it("should allow creating a form with an appendix 2 (using CreateFormInput.grouping)", async () => {
    const { user, company: ttr } = await userWithCompanyFactory("ADMIN");

    const appendix2 = await formFactory({
      ownerId: user.id,
      opt: {
        status: "AWAITING_GROUP",
        recipientCompanySiret: ttr.siret,
        quantityReceived: 1
      }
    });

    const createFormInput = {
      emitter: {
        type: EmitterType.APPENDIX2,
        company: {
          siret: ttr.siret
        }
      },
      grouping: [{ form: { id: appendix2.id }, quantity: 0.5 }]
    };
    const { mutate } = makeClient(user);
    const { data, errors } = await mutate<
      Pick<Mutation, "createForm">,
      MutationCreateFormArgs
    >(CREATE_FORM, {
      variables: { createFormInput }
    });

    expect(errors).toEqual(undefined);
    expect(data.createForm.grouping).toEqual([
      { form: { id: appendix2.id }, quantity: 0.5 }
    ]);
  });

  it("should allow consuming a BSDD in several appendix2", async () => {
    const { user, company: ttr } = await userWithCompanyFactory("ADMIN");

    const initialForm = await formFactory({
      ownerId: user.id,
      opt: {
        status: "AWAITING_GROUP",
        recipientCompanySiret: ttr.siret,
        quantityReceived: 1
      }
    });

    const createFormInput = {
      emitter: {
        type: EmitterType.APPENDIX2,
        company: {
          siret: ttr.siret
        }
      },
      grouping: [{ form: { id: initialForm.id }, quantity: 0.5 }]
    };
    const { mutate } = makeClient(user);
    const {
      data: { createForm: groupementForm1 }
    } = await mutate<Pick<Mutation, "createForm">, MutationCreateFormArgs>(
      CREATE_FORM,
      {
        variables: { createFormInput }
      }
    );

    expect(groupementForm1.grouping).toEqual([
      { form: { id: initialForm.id }, quantity: 0.5 }
    ]);

    const {
      data: { createForm: groupementForm2 }
    } = await mutate<Pick<Mutation, "createForm">, MutationCreateFormArgs>(
      CREATE_FORM,
      {
        variables: { createFormInput }
      }
    );

    expect(groupementForm2.grouping).toEqual([
      { form: { id: initialForm.id }, quantity: 0.5 }
    ]);
  });

  it("should fail when adding the same form twice to the same groupement form", async () => {
    const { user, company: ttr } = await userWithCompanyFactory("ADMIN");

    const initialForm = await formFactory({
      ownerId: user.id,
      opt: {
        status: "AWAITING_GROUP",
        recipientCompanySiret: ttr.siret,
        quantityReceived: 1
      }
    });

    const createFormInput = {
      emitter: {
        type: EmitterType.APPENDIX2,
        company: {
          siret: ttr.siret
        }
      },
      grouping: [
        { form: { id: initialForm.id }, quantity: 0.5 },
        { form: { id: initialForm.id }, quantity: 0.5 }
      ]
    };
    const { mutate } = makeClient(user);
    const { errors } = await mutate<
      Pick<Mutation, "createForm">,
      MutationCreateFormArgs
    >(CREATE_FORM, {
      variables: { createFormInput }
    });

    expect(errors).toEqual([
      expect.objectContaining({
        message:
          `Impossible d'associer plusieurs fractions du même bordereau initial sur un même bordereau` +
          ` de regroupement. Identifiant du ou des bordereaux initiaux concernés : ${initialForm.id}`
      })
    ]);
  });

  it(
    "should disallow creating a form with an appendix 2 if the appendix2" +
      " form is already part of another appendix (using CreateFormInput.appendix2Forms)",
    async () => {
      const { user, company: ttr } = await userWithCompanyFactory("ADMIN");

      const appendix2 = await formFactory({
        ownerId: user.id,
        opt: {
          status: "AWAITING_GROUP",
          recipientCompanySiret: ttr.siret,
          quantityReceived: 1
        }
      });
      await formFactory({
        ownerId: user.id,
        opt: {
          status: "DRAFT",
          recipientCompanyName: ttr.name,
          recipientCompanySiret: ttr.siret,
          grouping: {
            create: {
              initialFormId: appendix2.id,
              quantity: appendix2.quantityReceived
            }
          }
        }
      });

      const createFormInput = {
        emitter: {
          type: EmitterType.APPENDIX2,
          company: {
            siret: ttr.siret
          }
        },
        appendix2Forms: [{ id: appendix2.id }]
      };
      const { mutate } = makeClient(user);
      const { errors } = await mutate<Pick<Mutation, "createForm">>(
        CREATE_FORM,
        {
          variables: { createFormInput }
        }
      );

      expect(errors).toEqual([
        expect.objectContaining({
          message: `Le bordereau ${appendix2.readableId} a déjà été regroupé en totalité`,
          extensions: expect.objectContaining({
            code: ErrorCode.BAD_USER_INPUT
          })
        })
      ]);
    }
  );

  it(
    "should allow creating a form with an appendix 2 when the appendix2 quantity" +
      "is equal to the forwarded received quantity and higher thant the initial form received quantity",
    async () => {
      const { user, company: ttr } = await userWithCompanyFactory("ADMIN");

      const appendix2 = await formFactory({
        ownerId: user.id,
        opt: {
          status: "AWAITING_GROUP",
          recipientCompanySiret: ttr.siret,
          quantityReceived: 1,
          forwardedIn: {
            create: {
              readableId: getReadableId(),
              ownerId: user.id,
              quantityReceived: 2,
              recipientCompanySiret: ttr.siret
            }
          }
        }
      });

      const createFormInput = {
        emitter: {
          type: EmitterType.APPENDIX2,
          company: {
            siret: ttr.siret
          }
        },
        grouping: [{ form: { id: appendix2.id }, quantity: 2 }]
      };
      const { mutate } = makeClient(user);
      const { data } = await mutate<Pick<Mutation, "createForm">>(CREATE_FORM, {
        variables: { createFormInput }
      });

      expect(data.createForm.id).toBeTruthy();
    }
  );

  it(
    "should disallow creating a form with an appendix 2 if the quantity we try to group" +
      " is greater than the quantity available (using CreateFormInput.grouping)",
    async () => {
      const { user, company: ttr } = await userWithCompanyFactory("ADMIN");

      const appendix2 = await formFactory({
        ownerId: user.id,
        opt: {
          status: "AWAITING_GROUP",
          recipientCompanySiret: ttr.siret,
          quantityReceived: 1
        }
      });
      await formFactory({
        ownerId: user.id,
        opt: {
          status: "DRAFT",
          recipientCompanyName: ttr.name,
          recipientCompanySiret: ttr.siret,
          grouping: {
            create: {
              initialFormId: appendix2.id,
              quantity: 0.8
            }
          }
        }
      });

      const createFormInput = {
        emitter: {
          type: EmitterType.APPENDIX2,
          company: {
            siret: ttr.siret
          }
        },
        // trying to group 0.5 of this form but the quantity left
        // to group is equal to 0.2 = 1 - 0.8
        grouping: [{ form: { id: appendix2.id }, quantity: 0.5 }]
      };
      const { mutate } = makeClient(user);
      const { errors } = await mutate<Pick<Mutation, "createForm">>(
        CREATE_FORM,
        {
          variables: { createFormInput }
        }
      );

      expect(errors).toEqual([
        expect.objectContaining({
          message: `La quantité restante à regrouper sur le BSDD ${appendix2.readableId} est de 0.2 T. Vous tentez de regrouper 0.5 T.`,
          extensions: expect.objectContaining({
            code: ErrorCode.BAD_USER_INPUT
          })
        })
      ]);
    }
  );

  it(
    "should disallow linking an appendix 2 form if the emitter of the regroupement" +
      " form is not the recipient of the initial form (using CreateFormInput.appendix2Forms)",
    async () => {
      const { user, company: ttr } = await userWithCompanyFactory("MEMBER");

      const appendix2 = await formFactory({
        ownerId: (await userFactory()).id,
        opt: {
          status: Status.AWAITING_GROUP,
          quantityReceived: 1
        }
      });

      const createFormInput = {
        emitter: {
          type: EmitterType.APPENDIX2,
          company: {
            siret: ttr.siret
          }
        },
        appendix2Forms: [{ id: appendix2.id }]
      };
      const { mutate } = makeClient(user);
      const { errors } = await mutate<Pick<Mutation, "createForm">>(
        CREATE_FORM,
        {
          variables: { createFormInput }
        }
      );
      expect(errors).toEqual([
        expect.objectContaining({
          message: `Le bordereau ${appendix2.id} n'est pas en possession du nouvel émetteur`
        })
      ]);
    }
  );

  it(
    "should disallow linking an appendix 2 form if the emitter of the regroupement" +
      " form is not the recipient of the initial form (using CreateFormInput.grouping)",
    async () => {
      const appendix2 = await formFactory({
        ownerId: (await userFactory()).id,
        opt: { status: Status.AWAITING_GROUP, quantityReceived: 1 }
      });
      const { user, company: ttr } = await userWithCompanyFactory("MEMBER");

      const createFormInput: CreateFormInput = {
        emitter: {
          type: EmitterType.APPENDIX2,
          company: {
            siret: ttr.siret
          }
        },
        grouping: [
          { form: { id: appendix2.id }, quantity: appendix2.quantityReceived }
        ]
      };
      const { mutate } = makeClient(user);
      const { errors } = await mutate<Pick<Mutation, "createForm">>(
        CREATE_FORM,
        {
          variables: { createFormInput }
        }
      );
      expect(errors).toEqual([
        expect.objectContaining({
          message: `Le bordereau ${appendix2.id} n'est pas en possession du nouvel émetteur`
        })
      ]);
    }
  );

  it("should disallow linking an appendix2 form that is not awaiting groupement (using CreateFormInput.appendix2Forms)", async () => {
    const { user, company: ttr } = await userWithCompanyFactory("MEMBER");
    const appendix2 = await formFactory({
      ownerId: user.id,
      opt: { status: Status.SENT, recipientCompanySiret: ttr.siret }
    });

    const createFormInput = {
      emitter: {
        type: EmitterType.APPENDIX2,
        company: {
          siret: ttr.siret
        }
      },
      appendix2Forms: [{ id: appendix2.id }]
    };
    const { mutate } = makeClient(user);
    const { errors } = await mutate<Pick<Mutation, "createForm">>(CREATE_FORM, {
      variables: { createFormInput }
    });
    expect(errors).toEqual([
      expect.objectContaining({
        message: `Les BSDD initiaux ${appendix2.id} n'existent pas ou ne sont pas en attente de regroupement`
      })
    ]);
  });

  it("should disallow linking an appendix2 form that is not awaiting groupement (using CreateFormInput.grouping)", async () => {
    const { user, company: ttr } = await userWithCompanyFactory("MEMBER");
    const appendix2 = await formFactory({
      ownerId: user.id,
      opt: {
        status: Status.SENT,
        recipientCompanySiret: ttr.siret,
        quantityReceived: 1
      }
    });

    const createFormInput: CreateFormInput = {
      emitter: {
        type: EmitterType.APPENDIX2,
        company: {
          siret: ttr.siret
        }
      },
      grouping: [
        { form: { id: appendix2.id }, quantity: appendix2.quantityReceived }
      ]
    };
    const { mutate } = makeClient(user);
    const { errors } = await mutate<Pick<Mutation, "createForm">>(CREATE_FORM, {
      variables: { createFormInput }
    });
    expect(errors).toEqual([
      expect.objectContaining({
        message: `Les BSDD initiaux ${appendix2.id} n'existent pas ou ne sont pas en attente de regroupement`
      })
    ]);
  });

  it("should disallow linking an appendix2 form to a BSDD which emitter type is not APPENDIX2 (using CreateFormInput.appendix2Forms)", async () => {
    const { user, company: ttr } = await userWithCompanyFactory("MEMBER");
    const appendix2 = await formFactory({
      ownerId: user.id,
      opt: { status: Status.SENT, recipientCompanySiret: ttr.siret }
    });

    const createFormInput = {
      emitter: {
        type: "PRODUCER",
        company: {
          siret: ttr.siret
        }
      },
      appendix2Forms: [{ id: appendix2.id }]
    };
    const { mutate } = makeClient(user);
    const { errors } = await mutate<Pick<Mutation, "createForm">>(CREATE_FORM, {
      variables: { createFormInput }
    });
    expect(errors).toEqual([
      expect.objectContaining({
        message:
          "emitter.type doit être égal à APPENDIX2 lorsque `appendix2Forms` ou `grouping` n'est pas vide"
      })
    ]);
  });

  it("should disallow linking an appendix2 form to a BSDD which emitter type is not APPENDIX2 (using CreateFormInput.grouping)", async () => {
    const { user, company: ttr } = await userWithCompanyFactory("MEMBER");
    const appendix2 = await formFactory({
      ownerId: user.id,
      opt: {
        status: Status.AWAITING_GROUP,
        recipientCompanySiret: ttr.siret,
        quantityReceived: 1
      }
    });

    const createFormInput: CreateFormInput = {
      emitter: {
        type: "PRODUCER",
        company: {
          siret: ttr.siret
        }
      },
      grouping: [
        { form: { id: appendix2.id }, quantity: appendix2.quantityReceived }
      ]
    };
    const { mutate } = makeClient(user);
    const { errors } = await mutate<Pick<Mutation, "createForm">>(CREATE_FORM, {
      variables: { createFormInput }
    });
    expect(errors).toEqual([
      expect.objectContaining({
        message:
          "emitter.type doit être égal à APPENDIX2 lorsque `appendix2Forms` ou `grouping` n'est pas vide"
      })
    ]);
  });

  it("should throw error when trying to set both appendix2Forms and grouping", async () => {
    const { user, company: ttr } = await userWithCompanyFactory("MEMBER");
    const appendix2 = await formFactory({
      ownerId: user.id,
      opt: {
        status: Status.AWAITING_GROUP,
        recipientCompanySiret: ttr.siret,
        quantityReceived: 1
      }
    });

    const createFormInput: CreateFormInput = {
      emitter: {
        type: "APPENDIX2",
        company: {
          siret: ttr.siret
        }
      },
      grouping: [
        { form: { id: appendix2.id }, quantity: appendix2.quantityReceived }
      ],
      appendix2Forms: [{ id: appendix2.id }]
    };
    const { mutate } = makeClient(user);
    const { errors } = await mutate<Pick<Mutation, "createForm">>(CREATE_FORM, {
      variables: { createFormInput }
    });
    expect(errors).toEqual([
      expect.objectContaining({
        message:
          "Vous pouvez renseigner soit `appendix2Forms` soit `grouping` mais pas les deux"
      })
    ]);
  });

  it("should default to quantity left when no quantity is specified in grouping", async () => {
    const { user, company: ttr } = await userWithCompanyFactory("MEMBER");
    const appendix2 = await formFactory({
      ownerId: user.id,
      opt: {
        status: Status.AWAITING_GROUP,
        recipientCompanySiret: ttr.siret,
        quantityReceived: 1
      }
    });

    await formFactory({
      ownerId: user.id,
      opt: {
        status: Status.SEALED,
        recipientCompanySiret: ttr.siret,
        grouping: {
          create: {
            quantity: 0.2,
            initialFormId: appendix2.id
          }
        }
      }
    });

    const createFormInput: CreateFormInput = {
      emitter: {
        type: "APPENDIX2",
        company: {
          siret: ttr.siret
        }
      },
      grouping: [{ form: { id: appendix2.id } }]
    };

    const { mutate } = makeClient(user);
    const { data } = await mutate<Pick<Mutation, "createForm">>(CREATE_FORM, {
      variables: { createFormInput }
    });

    expect(data.createForm.grouping).toEqual([
      expect.objectContaining({
        quantity: 0.8,
        form: expect.objectContaining({ id: appendix2.id })
      })
    ]);
  });

  it("should not be possible to add more than 250 BSDDs on appendix2", async () => {
    const { user, company: ttr } = await userWithCompanyFactory("MEMBER");
    const createFormInput: CreateFormInput = {
      emitter: {
        type: "APPENDIX2",
        company: {
          siret: ttr.siret
        }
      },
      grouping: Array.from(Array(300).keys()).map(n => ({
        form: { id: `id_${n}` }
      }))
    };
    const { mutate } = makeClient(user);
    const { errors } = await mutate<Pick<Mutation, "createForm">>(CREATE_FORM, {
      variables: { createFormInput }
    });
    expect(errors).toEqual([
      expect.objectContaining({
        message: `Vous ne pouvez pas regrouper plus de 250 BSDDs initiaux`
      })
    ]);
  });

  it("should set isDangerous to `true` when specifying a waste code ending with *", async () => {
    const { user, company } = await userWithCompanyFactory("MEMBER");
    const { mutate } = makeClient(user);
    const { data } = await mutate<
      Pick<Mutation, "createForm">,
      MutationCreateFormArgs
    >(CREATE_FORM, {
      variables: {
        createFormInput: {
          emitter: {
            company: { siret: company.siret }
          },
          wasteDetails: { code: "20 01 27*" }
        }
      }
    });
    expect(data.createForm.wasteDetails.isDangerous).toEqual(true);
  });

  it("should set isDangerous to `false` when specifying a waste code without *", async () => {
    const { user, company } = await userWithCompanyFactory("MEMBER");
    const { mutate } = makeClient(user);
    const { data } = await mutate<
      Pick<Mutation, "createForm">,
      MutationCreateFormArgs
    >(CREATE_FORM, {
      variables: {
        createFormInput: {
          emitter: {
            company: { siret: company.siret }
          },
          wasteDetails: { code: "20 03 01" }
        }
      }
    });
    expect(data.createForm.wasteDetails.isDangerous).toEqual(false);
  });

  it("should throw an exception if trying to set `isDangerous=false` with a code containing *", async () => {
    const { user, company } = await userWithCompanyFactory("MEMBER");
    const { mutate } = makeClient(user);
    const { errors } = await mutate<
      Pick<Mutation, "createForm">,
      MutationCreateFormArgs
    >(CREATE_FORM, {
      variables: {
        createFormInput: {
          emitter: {
            company: { siret: company.siret }
          },
          wasteDetails: { code: "20 01 27*", isDangerous: false }
        }
      }
    });
    expect(errors).toEqual([
      expect.objectContaining({
        message:
          "Un déchet avec un code comportant un astérisque est forcément dangereux"
      })
    ]);
  });

  it("should be possible to set `isDangerous=true` with a code not containing *", async () => {
    const { user, company } = await userWithCompanyFactory("MEMBER");
    const { mutate } = makeClient(user);
    const { data } = await mutate<
      Pick<Mutation, "createForm">,
      MutationCreateFormArgs
    >(CREATE_FORM, {
      variables: {
        createFormInput: {
          emitter: {
            company: { siret: company.siret }
          },
          wasteDetails: { code: "20 03 01", isDangerous: true }
        }
      }
    });
    expect(data.createForm.wasteDetails.isDangerous).toBe(true);
  });

  it("should be possible to fill both a SIRET number and a TVA number for transporter", async () => {
    const { user, company: emitter } = await userWithCompanyFactory("MEMBER");
    const transporter = await companyFactory();
    const { mutate } = makeClient(user);
    const { data } = await mutate<
      Pick<Mutation, "createForm">,
      MutationCreateFormArgs
    >(CREATE_FORM, {
      variables: {
        createFormInput: {
          emitter: {
            company: { siret: emitter.siret }
          },
          transporter: {
            company: { siret: transporter.siret, vatNumber: "FR87850019464" }
          }
        }
      }
    });
    expect(data?.createForm?.id).toBeDefined();
  });

  it("should be possible to fill TVA number only for a foregin transporter", async () => {
    const { user, company: emitter } = await userWithCompanyFactory("MEMBER");
    const { company: transporterCompany } = await userWithCompanyFactory(
      UserRole.MEMBER,
      {
        companyTypes: {
          set: ["TRANSPORTER"]
        },
        vatNumber: "BE0541696005"
      }
    );

    const { mutate } = makeClient(user);
    const { data } = await mutate<
      Pick<Mutation, "createForm">,
      MutationCreateFormArgs
    >(CREATE_FORM, {
      variables: {
        createFormInput: {
          emitter: {
            company: { siret: emitter.siret }
          },
          transporter: {
            company: { vatNumber: transporterCompany.vatNumber }
          }
        }
      }
    });
    expect(data?.createForm?.id).toBeDefined();
  });

  it("should perform form creation in transaction", async () => {
    const { user, company } = await userWithCompanyFactory("MEMBER");
    const { mutate } = makeClient(user);

    const formCountBeforeCreation = await prisma.form.count();
    expect(formCountBeforeCreation).toEqual(0);

    const { errors } = await mutate<
      Pick<Mutation, "createForm">,
      MutationCreateFormArgs
    >(CREATE_FORM, {
      variables: {
        createFormInput: {
          emitter: {
            type: "APPENDIX2",
            company: { siret: company.siret }
          },
          // let's throw an error in appendix2 association that happens
          // after form creation in the mutation. Form creation should
          // be rolled back
          grouping: [{ form: { id: "does-not-exist" }, quantity: 1 }]
        }
      }
    });
    expect(errors).toEqual([
      expect.objectContaining({
        message:
          "Les BSDD initiaux does-not-exist n'existent pas ou ne sont pas en attente de regroupement"
      })
    ]);

    // check form has not been created
    const formCountAfterCreationAttempt = await prisma.form.count();
    expect(formCountAfterCreationAttempt).toEqual(0);
  });

  it("should fill denormalized fields upon creation", async () => {
    const { user, company } = await userWithCompanyFactory("MEMBER");
    const { mutate } = makeClient(user);

    const intermediaryCreation = toIntermediaryCompany(company);

    const { data } = await mutate<
      Pick<Mutation, "createForm">,
      MutationCreateFormArgs
    >(CREATE_FORM, {
      variables: {
        createFormInput: {
          emitter: {
            type: "APPENDIX2",
            company: { siret: company.siret }
          },
          transporter: { company: { siret: company.siret } },
          recipient: { company: { siret: company.siret } },
          intermediaries: [intermediaryCreation]
        }
      }
    });

    const form = await prisma.form.findUnique({
      where: { id: data.createForm.id }
    });

    expect(form.recipientsSirets).toContain(company.siret);
    expect(form.transportersSirets).toContain(company.siret);
    expect(form.intermediariesSirets).toContain(company.siret);
  });
});
