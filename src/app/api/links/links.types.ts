export type ApifyItem = {
  inputUrl?: string;
  url?: string;
  authorProfileUrl?: string;
  authorHeadline?: string;
  isActivity?: boolean;
  urn?: string;
  text?: string;
  postedAtTimestamp?: number;
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
