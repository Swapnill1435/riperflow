import { describe, it, expect } from 'vitest';
import { PROTECTION_LEVELS, getProtection, listProtectionLevels, canWrite, canDelete, needsApproval, ProtectionLevel } from '../src/core/protection.js';

describe('Protection', () => {
  describe('PROTECTION_LEVELS', () => {
    it('should have 6 protection levels', () => {
      expect(Object.keys(PROTECTION_LEVELS)).toHaveLength(6);
    });

    it('should have none/open level', () => {
      expect(PROTECTION_LEVELS.none).toBeDefined();
      expect(PROTECTION_LEVELS.none.allowsWrite).toBe(true);
      expect(PROTECTION_LEVELS.none.allowsDelete).toBe(true);
      expect(PROTECTION_LEVELS.none.requiresApproval).toBe(false);
    });

    it('should have warn level', () => {
      expect(PROTECTION_LEVELS.warn).toBeDefined();
      expect(PROTECTION_LEVELS.warn.allowsWrite).toBe(true);
    });

    it('all level ids are unique', () => {
      const ids = Object.values(PROTECTION_LEVELS).map(l => l.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('each level id matches its registry key', () => {
      for (const [key, level] of Object.entries(PROTECTION_LEVELS)) {
        expect(level.id).toBe(key);
      }
    });

    it('should have confirm level', () => {
      expect(PROTECTION_LEVELS.confirm).toBeDefined();
      expect(PROTECTION_LEVELS.confirm.allowsWrite).toBe(true);
      expect(PROTECTION_LEVELS.confirm.allowsDelete).toBe(false);
    });

    it('should have review level', () => {
      expect(PROTECTION_LEVELS.review).toBeDefined();
      expect(PROTECTION_LEVELS.review.requiresApproval).toBe(true);
    });

    it('should have locked level', () => {
      expect(PROTECTION_LEVELS.locked).toBeDefined();
      expect(PROTECTION_LEVELS.locked.allowsWrite).toBe(false);
      expect(PROTECTION_LEVELS.locked.allowsDelete).toBe(false);
      expect(PROTECTION_LEVELS.locked.requiresApproval).toBe(true);
    });

    it('should have frozen level', () => {
      expect(PROTECTION_LEVELS.frozen).toBeDefined();
      expect(PROTECTION_LEVELS.frozen.allowsWrite).toBe(false);
      expect(PROTECTION_LEVELS.frozen.allowsDelete).toBe(false);
      expect(PROTECTION_LEVELS.frozen.requiresApproval).toBe(false);
    });
  });

  describe('getProtection', () => {
    it('should return protection for valid level', () => {
      const protection = getProtection('locked');
      expect(protection).toBeDefined();
      expect(protection?.name).toBe('Locked');
    });

    it('should return undefined for invalid level', () => {
      const protection = getProtection('invalid');
      expect(protection).toBeUndefined();
    });
  });

  describe('listProtectionLevels', () => {
    it('should return all protection levels', () => {
      const levels = listProtectionLevels();
      expect(levels).toHaveLength(6);
    });
  });

  describe('canWrite', () => {
    it('should return true for none', () => {
      expect(canWrite('none')).toBe(true);
    });

    it('should return false for locked', () => {
      expect(canWrite('locked')).toBe(false);
    });

    it('should return false for frozen', () => {
      expect(canWrite('frozen')).toBe(false);
    });
  });

  describe('canDelete', () => {
    it('should return true for none', () => {
      expect(canDelete('none')).toBe(true);
    });

    it('should return false for confirm', () => {
      expect(canDelete('confirm')).toBe(false);
    });
  });

  describe('needsApproval', () => {
    it('should return false for none', () => {
      expect(needsApproval('none')).toBe(false);
    });

    it('should return true for review', () => {
      expect(needsApproval('review')).toBe(true);
    });

    it('should return true for locked', () => {
      expect(needsApproval('locked')).toBe(true);
    });

    it('should return false for frozen', () => {
      expect(needsApproval('frozen')).toBe(false);
    });
  });
});
