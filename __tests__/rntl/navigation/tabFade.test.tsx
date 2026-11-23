/**
 * Tab switches use a short ease-out fade (80 ms), not the stock 150 ms linear one.
 * The tab navigator is replaced by a recorder so only the options AppNavigator hands it are read.
 */
import React from 'react';
import { Easing } from 'react-native';
import { render } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useAppStore } from '../../../src/stores/appStore';
import { resetStores, setupWithActiveModel } from '../../utils/testHelpers';

let mockScreenOptions: any;
jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => ({
    Navigator: (props: any) => { mockScreenOptions = props.screenOptions; return null; },
    Screen: () => null,
  }),
}));

import { AppNavigator } from '../../../src/navigation/AppNavigator';

describe('tab fade', () => {
  it('fades between tabs in 80 ms with an ease-out curve', () => {
    resetStores();
    setupWithActiveModel();
    useAppStore.setState({ hasCompletedOnboarding: true });
    render(<NavigationContainer><AppNavigator /></NavigationContainer>);

    const options = mockScreenOptions({ route: { name: 'HomeTab' } });
    expect(options.animation).toBe('fade');
    expect(options.transitionSpec.animation).toBe('timing');
    expect(options.transitionSpec.config.duration).toBe(80);
    expect(options.transitionSpec.config.easing(0.5)).toBeCloseTo(Easing.out(Easing.quad)(0.5));
  });
});
