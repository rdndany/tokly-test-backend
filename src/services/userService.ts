import UserModel from "../models/User";
import FollowModel from "../models/Follow";

export type PublicProfile = {
  id: string;
  handle: string;
  name: string;
  fullName?: string;
  image?: string;
  followersCount: number;
  followingCount: number;
  isFollowing?: boolean;
};

export async function getPublicProfileByHandle(
  handle: string,
  currentUserId?: string
): Promise<PublicProfile | null> {
  const normalized = handle.trim().toLowerCase();
  if (!normalized) return null;

  const user = await UserModel.findOne({ handle: normalized })
    .select("_id handle name fullName image")
    .lean();

  if (!user) return null;

  const [followersCount, followingCount, isFollowing] = await Promise.all([
    FollowModel.countDocuments({ followingId: user._id }),
    FollowModel.countDocuments({ followerId: user._id }),
    currentUserId && currentUserId !== user._id
      ? FollowModel.exists({
          followerId: currentUserId,
          followingId: user._id,
        }).then((r) => !!r)
      : Promise.resolve(false),
  ]);

  return {
    id: user._id,
    handle: user.handle ?? normalized,
    name: user.name,
    fullName: user.fullName,
    image: user.image,
    followersCount,
    followingCount,
    ...(currentUserId && currentUserId !== user._id && { isFollowing: !!isFollowing }),
  };
}

export async function follow(
  followerId: string,
  targetHandle: string
): Promise<{ success: boolean; message?: string }> {
  const normalized = targetHandle.trim().toLowerCase();
  if (!normalized) return { success: false, message: "Handle is required" };

  const target = await UserModel.findOne({ handle: normalized })
    .select("_id")
    .lean();
  if (!target) return { success: false, message: "User not found" };
  if (target._id === followerId)
    return { success: false, message: "Cannot follow yourself" };

  const existing = await FollowModel.findOne({
    followerId,
    followingId: target._id,
  });
  if (existing) return { success: true };

  await FollowModel.create({
    followerId,
    followingId: target._id,
  });
  return { success: true };
}

export async function unfollow(
  followerId: string,
  targetHandle: string
): Promise<{ success: boolean; message?: string }> {
  const normalized = targetHandle.trim().toLowerCase();
  if (!normalized) return { success: false, message: "Handle is required" };

  const target = await UserModel.findOne({ handle: normalized })
    .select("_id")
    .lean();
  if (!target) return { success: false, message: "User not found" };

  await FollowModel.deleteOne({
    followerId,
    followingId: target._id,
  });
  return { success: true };
}
