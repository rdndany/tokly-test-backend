import mongoose from "mongoose";
import UserModel from "../models/User";
import WorkspaceModel from "../models/Workspace";
import WorkspaceMemberModel from "../models/WorkspaceMember";
import WorkspaceInvitationModel from "../models/WorkspaceInvitation";
import WorkspaceMonthlyCreditsModel from "../models/WorkspaceMonthlyCredits";
import ProjectModel from "../models/Project";
import ProjectFolderModel from "../models/ProjectFolder";
import ProjectChatMessageModel from "../models/ProjectChatMessage";
import ProjectFileModel from "../models/ProjectFile";
import ProjectHistoryModel from "../models/ProjectHistory";
import StarredProjectModel from "../models/StarredProject";
import ChatFeedbackModel from "../models/ChatFeedback";
import UserDailyCreditsModel from "../models/UserDailyCredits";
import UserMonthlyCreditsModel from "../models/UserMonthlyCredits";
import FollowModel from "../models/Follow";

/**
 * Cascade delete all data owned by or associated with a user.
 * Called from the Clerk user.deleted webhook.
 */
export async function deleteUserData(userId: string): Promise<void> {
  const workspaceIds = await WorkspaceModel.find({ createdBy: userId })
    .select("_id")
    .lean()
    .then((docs) => docs.map((d) => d._id));

  // 1. Get all projects owned by user
  const projectIds = await ProjectModel.find({ userId })
    .select("_id")
    .lean()
    .then((docs) => docs.map((d) => d._id));

  if (projectIds.length > 0) {
    const projectIdObjs = projectIds.map((id) =>
      typeof id === "string" ? new mongoose.Types.ObjectId(id) : id
    );

    // Delete project-related data for user's projects
    await Promise.all([
      ProjectChatMessageModel.deleteMany({ projectId: { $in: projectIdObjs } }),
      StarredProjectModel.deleteMany({ projectId: { $in: projectIdObjs } }),
      ProjectFileModel.deleteMany({ projectId: { $in: projectIdObjs } }),
      ChatFeedbackModel.deleteMany({ projectId: { $in: projectIdObjs } }),
      ProjectHistoryModel.deleteMany({ projectId: { $in: projectIdObjs } }),
    ]);

    await ProjectModel.deleteMany({ _id: { $in: projectIdObjs } });
  }

  // 2. Delete project folders: user's personal folders + folders in workspaces they own
  const folderFilter =
    workspaceIds.length > 0
      ? { $or: [{ userId }, { workspaceId: { $in: workspaceIds } }] }
      : { userId };
  await ProjectFolderModel.deleteMany(folderFilter);

  // 3. For owned workspaces: delete members, invitations, credits, then workspace
  if (workspaceIds.length > 0) {
    await Promise.all([
      WorkspaceMemberModel.deleteMany({ workspaceId: { $in: workspaceIds } }),
      WorkspaceInvitationModel.deleteMany({
        workspaceId: { $in: workspaceIds },
      }),
      WorkspaceMonthlyCreditsModel.deleteMany({
        workspaceId: { $in: workspaceIds },
      }),
    ]);
    await WorkspaceModel.deleteMany({ _id: { $in: workspaceIds } });
  }

  // 4. User's membership in workspaces they don't own
  await WorkspaceMemberModel.deleteMany({ userId });

  // 5. Invitations sent by or accepted by user
  await WorkspaceInvitationModel.deleteMany({
    $or: [{ invitedBy: userId }, { acceptedBy: userId }],
  });

  // 6. User credits
  await Promise.all([
    UserDailyCreditsModel.deleteMany({ userId }),
    UserMonthlyCreditsModel.deleteMany({ userId }),
  ]);

  // 7. Chat messages by user in projects they don't own (e.g. shared/collaborative)
  await ProjectChatMessageModel.deleteMany({ userId });

  // 8. Starred projects (user starred others' projects)
  await StarredProjectModel.deleteMany({ userId });

  // 9. Chat feedback (user's feedback on others' projects)
  await ChatFeedbackModel.deleteMany({ userId });

  // 10. Follow relationships
  await FollowModel.deleteMany({
    $or: [{ followerId: userId }, { followingId: userId }],
  });

  // 11. User document
  await UserModel.findByIdAndDelete(userId);
}
