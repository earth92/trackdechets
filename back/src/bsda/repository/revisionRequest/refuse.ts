import {
  RevisionRequestApprovalStatus,
  RevisionRequestStatus
} from "@prisma/client";
import {
  LogMetadata,
  RepositoryFnDeps
} from "../../../common/repository/types";

export type RefuseRevisionRequestApprovalFn = (
  revisionRequestApprovalId: string,
  { comment }: { comment?: string },
  logMetadata?: LogMetadata
) => Promise<void>;

export function buildRefuseRevisionRequestApproval(
  deps: RepositoryFnDeps
): RefuseRevisionRequestApprovalFn {
  return async (revisionRequestApprovalId, { comment }, logMetadata) => {
    const { prisma, user } = deps;
    const revisionRequestApproval =
      await prisma.bsdaRevisionRequestApproval.update({
        where: { id: revisionRequestApprovalId },
        data: {
          status: RevisionRequestApprovalStatus.REFUSED,
          comment
        }
      });

    // We have a refusal:
    // - mark revision as refused
    // - mark every awaiting approval as skipped
    await prisma.bsdaRevisionRequest.update({
      where: { id: revisionRequestApproval.revisionRequestId },
      data: { status: RevisionRequestStatus.REFUSED }
    });
    await prisma.bsdaRevisionRequestApproval.updateMany({
      where: {
        revisionRequestId: revisionRequestApproval.revisionRequestId,
        status: RevisionRequestApprovalStatus.PENDING
      },
      data: { status: RevisionRequestApprovalStatus.CANCELED }
    });

    await prisma.event.create({
      data: {
        streamId: revisionRequestApproval.revisionRequestId,
        actor: user.id,
        type: "BsdaRevisionRequestRefused",
        data: {
          content: {
            status: RevisionRequestApprovalStatus.REFUSED,
            comment
          }
        },
        metadata: { ...logMetadata, authType: user.auth }
      }
    });
  };
}
