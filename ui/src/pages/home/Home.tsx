import React from 'react';
import CallToAction from '../../common-ui/call-to-action/CallToAction';
import Hero from '../../common-ui/hero/Hero';
import HowItWorks from '../../common-ui/how-it-works/HowItWorks';
import Membership from '../../common-ui/membership/Membership';
import Services from '../../common-ui/services/Services';

const Home: React.FC = () => (
    <>
        <Hero />
        <Services />
        <HowItWorks />
        <Membership />
        <CallToAction />
    </>
);

export default Home;
