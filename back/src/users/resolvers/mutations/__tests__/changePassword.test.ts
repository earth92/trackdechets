import { changePasswordFn as changePassword } from "../changePassword";
import { ErrorCode } from "../../../../common/errors";
import { hashPassword } from "../../../utils";

const userMock = jest.fn();
const updateUserMock = jest.fn();

jest.mock("../../../../prisma", () => ({
  user: {
    findUnique: jest.fn((...args) => userMock(...args)),
    update: jest.fn((...args) => updateUserMock(...args))
  }
}));

const clearUserSessionsMock = jest.fn();
const storeUserSessionsIdMock = jest.fn();
jest.mock("../../../../common/redis/users", () => ({
  clearUserSessions: jest.fn((...args) => clearUserSessionsMock(...args)),
  storeUserSessionsId: jest.fn((...args) => storeUserSessionsIdMock(...args))
}));

describe("changePassword", () => {
  beforeEach(() => {
    userMock.mockReset();
    updateUserMock.mockReset();
  });

  it("should raise BAD_USER_INPUT exception if hash comparison fails", async () => {
    userMock.mockResolvedValueOnce({
      password: await hashPassword("oldPassword")
    });
    expect.assertions(1);
    try {
      await changePassword(
        "userId",
        {
          oldPassword: "badOldPassword",
          newPassword: "trackdechets#"
        },
        "xyz"
      );
    } catch (e) {
      expect(e.extensions.code).toEqual(ErrorCode.BAD_USER_INPUT);
    }
  });

  it("should update user with new hashed password", async () => {
    const hashedPassword = await hashPassword("oldPassword");
    userMock.mockResolvedValueOnce({
      password: hashedPassword
    });
    await changePassword(
      "userId",
      {
        oldPassword: "oldPassword",
        newPassword: "trackdechets#"
      },
      "xyz"
    );
    expect(updateUserMock).toHaveBeenCalled();
  });
});
