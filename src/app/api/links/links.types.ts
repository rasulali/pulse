export type ApifyItem = {
  inputUrl?: string;
  url?: string;
  authorProfileUrl?: string;
  isActivity?: boolean;
  urn?: string;
  text?: string;
  postedAtTimestamp?: number | string;
  postedAtISO?: string;
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
