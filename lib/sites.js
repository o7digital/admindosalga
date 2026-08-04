export const sites = [
  {
    id: 'dosalga-mexico',
    name: 'Dosalga Mexico',
    storeUrl: 'https://www.dosalga.online',
    defaultSaleCurrency: 'MXN',
    market: 'Mexico',
    domain: 'dosalga.online',
    status: 'En construction',
  },
  {
    id: 'dosalga-usa',
    name: 'Dosalga USA',
    storeUrl: 'https://www.dosalga.store',
    defaultSaleCurrency: 'USD',
    market: 'USA',
    domain: 'dosalga.store',
    status: 'Live',
  },
];

export const getSiteById = (siteId) => {
  return sites.find((site) => site.id === siteId) || sites[0];
};
