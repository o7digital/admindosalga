export const sites = [
  {
    id: 'dosalga',
    name: 'Dosalga',
    storeUrl: 'https://www.dosalga.online',
    defaultSaleCurrency: 'MXN',
  },
  {
    id: 'client-site-2',
    name: 'Second site client',
    storeUrl: '',
    defaultSaleCurrency: 'MXN',
  },
];

export const getSiteById = (siteId) => {
  return sites.find((site) => site.id === siteId) || sites[0];
};
