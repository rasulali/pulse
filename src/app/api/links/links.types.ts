export type ApifyItem = {
  inputUrl?: string;
  authorProfileUrl?: string;
  authorHeadline?: string;
  isActivity?: boolean;
  author?: {
    occupation?: string;
    publicId?: string;
    firstName?: string;
    lastName?: string;
  };
  activityOfUser?: {
    occupation?: string;
    publicId?: string;
    firstName?: string;
    lastName?: string;
  };
  activityDescription?: { occupation?: string };
};
