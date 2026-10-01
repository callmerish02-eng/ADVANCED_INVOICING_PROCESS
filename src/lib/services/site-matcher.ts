import { MasterSite } from '@/lib/types/invoice';

const STOPWORDS = new Set([
  'india', 'india.', 'gujarat', 'maharashtra', 'delhi', 'karnataka',
  'tamil', 'nadu', 'west', 'bengal', 'pradesh', 'rajasthan', 'haryana',
  'road', 'street', 'ave', 'avenue', 'nagar', 'colony', 'marg',
  'estate', 'industrial', 'area', 'sector', 'phase', 'plot',
  'private', 'limited', 'ltd', 'pvt', 'inc', 'llp', 'the', 'and', 'for',
  'near', 'nr', 'opposite', 'opp', 'behind', 'beside', 'floor', 'building'
]);

function extractPincode(text?: string): string | null {
  if (!text) return null;
  const match = text.match(/\b[1-9][0-9]{5}\b/);
  return match ? match[0] : null;
}

export interface SiteMatchResult {
  site?: MasterSite;
  entity?: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  matchReason?: string;
}

export function matchSiteAndEntity(
  invoice: {
    buyerAddress?: string;
    buyerName?: string;
    buyerGstin?: string;
    detectedSite?: string;
    vendorName?: string;
    vendorAddress?: string;
  },
  sites: MasterSite[]
): SiteMatchResult {
  if (!sites || sites.length === 0) {
    return { confidence: 'NONE' };
  }

  const buyerAddr = (invoice.buyerAddress || '').toLowerCase().trim();
  const buyerName = (invoice.buyerName || '').toLowerCase().trim();
  const detectedSite = (invoice.detectedSite || '').toLowerCase().trim();
  const vendorName = (invoice.vendorName || '').toLowerCase().trim();
  const invPincode = extractPincode(buyerAddr) || extractPincode(invoice.detectedSite);

  // Detect Entity directly from buyer name
  let detectedEntity: string | undefined = undefined;
  if (buyerName.includes('healthcare') || buyerName.includes('1mgh')) {
    detectedEntity = '1MGH';
  } else if (buyerName.includes('technologies') || buyerName.includes('1mgt')) {
    detectedEntity = '1MGT';
  } else if (buyerName.includes('labs') || buyerName.includes('1lfs')) {
    detectedEntity = '1LFS';
  }

  let bestSite: MasterSite | null = null;
  let highestScore = 0;
  let topReason = '';

  for (const site of sites) {
    let score = 0;
    const reasons: string[] = [];

    const siteAddr = (site.address || '').toLowerCase();
    const siteTag = (site.tag || '').toLowerCase();
    const siteHana = (site.hanaName || '').toLowerCase();
    const siteEntity = (site.entity || '').toLowerCase();
    const siteVendor = (site.vendorName || '').toLowerCase();
    const sitePincode = extractPincode(site.address);

    // 1. PIN code match (Strongest signal for Indian sites)
    if (invPincode && sitePincode && invPincode === sitePincode) {
      score += 55;
      reasons.push(`PIN code ${invPincode}`);
    }

    // 2. Explicit site tag match
    if (siteTag && siteTag.length >= 3) {
      if (detectedSite.includes(siteTag) || buyerAddr.includes(siteTag) || buyerName.includes(siteTag)) {
        score += 45;
        reasons.push(`Site Tag "${site.tag}"`);
      }
    }

    // 3. HANA Name match in address or detected location
    if (siteHana && siteHana.length >= 4) {
      if (detectedSite.includes(siteHana) || buyerAddr.includes(siteHana)) {
        score += 40;
        reasons.push(`HANA Name "${site.hanaName}"`);
      }
    }

    // 4. Entity match
    if (detectedEntity && site.entity.toUpperCase() === detectedEntity) {
      score += 20;
    } else if (siteEntity && buyerName.includes(siteEntity)) {
      score += 20;
      reasons.push(`Entity ${site.entity}`);
    }

    // 5. Address token overlap (ignoring common stopwords)
    const tokens = buyerAddr
      .split(/[\s,\-]+/)
      .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
    if (tokens.length > 0) {
      const hits = tokens.filter((t) => siteAddr.includes(t));
      if (hits.length > 0) {
        score += hits.length * 10;
        reasons.push(`Address tokens (${hits.slice(0, 3).join(', ')})`);
      }
    }

    // 6. Vendor association boost
    if (vendorName && siteVendor && (siteVendor.includes(vendorName) || vendorName.includes(siteVendor))) {
      score += 25;
      reasons.push(`Vendor association`);
    }

    if (score > highestScore) {
      highestScore = score;
      bestSite = site;
      topReason = reasons.join(' + ');
    }
  }

  if (bestSite && highestScore >= 30) {
    return {
      site: bestSite,
      entity: bestSite.entity || detectedEntity,
      confidence: highestScore >= 60 ? 'HIGH' : 'MEDIUM',
      matchReason: topReason,
    };
  }

  return {
    entity: detectedEntity,
    confidence: 'NONE',
  };
}
