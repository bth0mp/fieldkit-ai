/**
 * AboutScreen + OpenSourceLicensesScreen.
 *
 * About shows the app's own name, links to its own source, and opens the licenses screen.
 * The licenses screen must carry the MIT notice of the original app and local-dream's
 * CC BY-NC attribution (both are license obligations, not decoration).
 */
import React from 'react';
import { Linking } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { BRAND } from '../../../src/config/branding';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));
jest.mock('../../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));
jest.mock('../../../src/components/AnimatedListItem', () => ({
  AnimatedListItem: ({ children, onPress, style, testID }: any) => {
    const { TouchableOpacity } = require('react-native');
    return <TouchableOpacity style={style} onPress={onPress} testID={testID}>{children}</TouchableOpacity>;
  },
}));
jest.mock('../../../package.json', () => ({ version: '1.0.0' }), { virtual: true });

import { AboutScreen } from '../../../src/screens/AboutScreen';
import { OpenSourceLicensesScreen } from '../../../src/screens/OpenSourceLicensesScreen';

describe('AboutScreen', () => {
  afterEach(() => jest.restoreAllMocks());

  it('shows the app name and no upstream branding', () => {
    const { getByText, queryByText } = render(<AboutScreen />);
    expect(getByText(BRAND.name)).toBeTruthy();
    expect(queryByText(/Off Grid|Wednesday|Slack|@alichherawalla/)).toBeNull();
  });

  it('opens this app\'s own repository from Source Code', () => {
    const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const { getByText } = render(<AboutScreen />);
    fireEvent.press(getByText('Source Code'));
    expect(spy).toHaveBeenCalledWith(BRAND.repoUrl);
  });

  it('opens the open-source licenses screen', () => {
    const { getByTestId } = render(<AboutScreen />);
    fireEvent.press(getByTestId('about-open-source-licenses'));
    expect(mockNavigate).toHaveBeenCalledWith('OpenSourceLicenses');
  });
});

describe('OpenSourceLicensesScreen', () => {
  it('shows the original MIT notice when its entry is opened', () => {
    const { getByText } = render(<OpenSourceLicensesScreen />);
    fireEvent.press(getByText(/Off Grid AI \(the open-source app this one is based on\)/));
    expect(getByText(/Permission is hereby granted, free of charge/)).toBeTruthy();
  });

  it('credits local-dream under CC BY-NC 4.0', () => {
    const { getByText } = render(<OpenSourceLicensesScreen />);
    fireEvent.press(getByText(/^local-dream/));
    expect(getByText(/Attribution-NonCommercial 4\.0/)).toBeTruthy();
  });
});
